import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SmartHomeApiStub } from '../../testing/api-stub';
import { HomeStore } from './home-store';
import { SmartHomeApi } from '../api/smart-home-api';
import { Device, LampDevice } from '../models';

/** Lets queued microtasks and the store's post-await work run. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('HomeStore', () => {
  let api: SmartHomeApiStub;
  let store: HomeStore;

  beforeEach(async () => {
    api = new SmartHomeApiStub();
    TestBed.configureTestingModule({ providers: [{ provide: SmartHomeApi, useValue: api }] });
    store = TestBed.inject(HomeStore);
    await store.load();
  });

  function lampWhere(on: boolean): LampDevice {
    const lamp = store
      .devices()
      .find((device): device is LampDevice => device.kind === 'lamp' && device.on === on);
    if (!lamp) {
      throw new Error(`no lamp with on=${on} in the stub data`);
    }
    return lamp;
  }

  function getLamp(id: string): LampDevice {
    const device = store.deviceById(id);
    if (device?.kind !== 'lamp') {
      throw new Error(`device ${id} is not a lamp`);
    }
    return device;
  }

  function getDevice(id: string): Device {
    const device = store.deviceById(id);
    if (!device) {
      throw new Error(`device ${id} not found`);
    }
    return device;
  }

  it('loads the home from the API and derives lamp state from recorded commands', () => {
    expect(store.status()).toBe('ready');
    expect(store.rooms().length).toBe(5);
    expect(store.devices().length).toBe(10);
    // Device 1's latest command in the log is ON; the other lamps' is OFF.
    expect(getLamp('1').on).toBe(true);
    expect(getLamp('2').on).toBe(false);
    const thermometer = getDevice('3');
    expect(thermometer.kind === 'thermometer' && thermometer.temperature).toBe(21);
    expect(thermometer.kind === 'thermometer' && thermometer.humidity).toBe(43);
    expect(getDevice('10').online).toBe(false);
  });

  /**
   * The two things that used to move a number on their own:
   *
   * 1. Age. Current values came from a "newest 1000 rows in the last 48 hours"
   *    query, so a device that reports rarely fell out of it and read as having
   *    no data — the value vanished without anything happening.
   * 2. Which screen asked. The dialog re-fetched with a per-device filter, which
   *    hit a different slice of that window, so it could show another value than
   *    the tile behind it.
   */
  it('shows a reading no matter how old it is, and the dialog refresh does not change it', async () => {
    const ancient = api.samples
      .filter((sample) => sample.deviceId === 3)
      .map((sample) => ({ ...sample, timestamp: '2020-01-01T00:00:00' }));
    api.samples = [
      ...api.samples.filter((sample) => sample.deviceId !== 3),
      // Oldest first, so "the first one that arrives" would be the wrong answer.
      ...ancient,
      {
        ...ancient[0],
        dataId: 90_001,
        sensorType: 'temperature',
        value: 17,
        timestamp: '2020-01-02T00:00:00',
      },
    ];

    await store.load();
    const fromList = getDevice('3');
    expect(fromList.kind === 'thermometer' && fromList.temperature).toBe(17);

    // Opening the dialog triggers this; it must land on the same row.
    await store.refreshDevice('3');
    const fromDetail = getDevice('3');
    expect(fromDetail.kind === 'thermometer' && fromDetail.temperature).toBe(17);
  });

  it('goes to error state when the API is down, and recovers on retry', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const workingGetRooms = api.getRooms.bind(api);
      api.getRooms = () => Promise.reject(new Error('offline'));
      await store.load();
      expect(store.status()).toBe('error');

      api.getRooms = workingGetRooms;
      await store.load();
      expect(store.status()).toBe('ready');
    } finally {
      consoleError.mockRestore();
    }
  });

  it('flips a lamp immediately and keeps the new state when the command is accepted', async () => {
    let resolveCommand!: () => void;
    api.commandImpl = (id, body) =>
      new Promise((resolve) => {
        resolveCommand = () =>
          resolve({ message: `Command '${body.command}' recorded for device ${id}.` });
      });

    const lamp = lampWhere(false);
    store.toggleLamp(lamp.id);

    // Optimistic: the switch flips before the API answers.
    expect(getLamp(lamp.id).on).toBe(true);
    expect(store.pendingSwitch().get(lamp.id)).toBe(true);

    resolveCommand();
    await flush();

    expect(getLamp(lamp.id).on).toBe(true);
    expect(store.pendingSwitch().size).toBe(0);
    expect(store.toasts().length).toBe(0);
  });

  it('rolls the lamp back and offers retry when the command is rejected', async () => {
    api.commandImpl = () => Promise.reject(new Error('503'));

    const lamp = lampWhere(false);
    store.toggleLamp(lamp.id);
    expect(getLamp(lamp.id).on).toBe(true);

    await flush();

    expect(getLamp(lamp.id).on).toBe(false);
    expect(store.pendingSwitch().size).toBe(0);
    const toast = store.toasts()[0];
    expect(toast).toBeDefined();
    expect(toast.variant).toBe('alert');
    expect(toast.message).toContain('svarede ikke');
    expect(toast.message).toContain('slukket');
    expect(toast.action?.label).toBe('Prøv igen');

    // The lamp is not locked: a later toggle goes through.
    api.commandImpl = (id, body) =>
      Promise.resolve({ message: `Command '${body.command}' recorded for device ${id}.` });
    store.toggleLamp(lamp.id);
    expect(getLamp(lamp.id).on).toBe(true);
    await flush();
  });

  it('ignores a second toggle while a command is in flight', async () => {
    let resolveCommand!: () => void;
    api.commandImpl = (id, body) =>
      new Promise((resolve) => {
        resolveCommand = () =>
          resolve({ message: `Command '${body.command}' recorded for device ${id}.` });
      });

    const lamp = lampWhere(false);
    store.toggleLamp(lamp.id);
    store.toggleLamp(lamp.id);

    expect(api.commandCalls).toBe(1);
    resolveCommand();
    await flush();
  });

  it('sends one command per lit lamp when turning everything off', () => {
    const litBefore = store.lampsOnCount();
    expect(litBefore).toBeGreaterThan(0);

    store.setAllLamps(false);

    expect(api.commandCalls).toBe(litBefore);
    expect(store.lampsOnCount()).toBe(0); // optimistic
  });

  it('hides a removed device at once but only deletes it on the server after the undo window', async () => {
    vi.useFakeTimers();
    try {
      const lamp = lampWhere(true);
      store.removeDevice(lamp.id);

      expect(store.deviceById(lamp.id)).toBeUndefined();
      expect(api.deletedDeviceIds).toEqual([]);
      expect(store.toasts()[0].message).toBe(`${lamp.name} er fjernet`);

      await vi.advanceTimersByTimeAsync(10_000);

      expect(api.deletedDeviceIds).toEqual([lamp.id]);
      expect(store.toasts().length).toBe(0);
      expect(store.deviceById(lamp.id)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('undo brings the device back and the server delete never happens', async () => {
    vi.useFakeTimers();
    try {
      const lamp = lampWhere(true);
      store.removeDevice(lamp.id);
      store.runToastAction(store.toasts()[0].id);

      expect(getDevice(lamp.id).roomId).toBe(lamp.roomId);
      expect(store.toasts().length).toBe(0);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(api.deletedDeviceIds).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves devices on delete, defers the room delete, and undo moves everything home', async () => {
    vi.useFakeTimers();
    try {
      const stueDevices = store.devicesInRoom('1').map((device) => device.id);
      store.deleteRoom('1', '2');

      expect(store.roomById('1')).toBeUndefined();
      for (const id of stueDevices) {
        expect(getDevice(id).roomId).toBe('2');
      }
      expect(api.deletedRoomIds).toEqual([]);

      store.runToastAction(store.toasts()[0].id);

      expect(store.roomById('1')?.name).toBe('Stue');
      for (const id of stueDevices) {
        expect(getDevice(id).roomId).toBe('1');
      }
      await vi.advanceTimersByTimeAsync(30_000);
      expect(api.deletedRoomIds).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits the room (and device) deletes when the undo window closes', async () => {
    vi.useFakeTimers();
    try {
      store.deleteRoom('5', null);
      expect(store.deviceById('10')).toBeUndefined();
      expect(api.deletedRoomIds).toEqual([]);

      await vi.advanceTimersByTimeAsync(10_000);

      expect(api.deletedDeviceIds).toEqual(['10']);
      expect(api.deletedRoomIds).toEqual(['5']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits an older overlapping room-undo instead of offering a misleading Fortryd', async () => {
    store.deleteRoom('1', '2');
    const firstToast = store.toasts()[0];

    store.deleteRoom('2', '3');
    await flush();

    // The first undo could no longer restore faithfully, so it was committed.
    expect(store.toasts().some((toast) => toast.id === firstToast.id)).toBe(false);
    expect(api.deletedRoomIds).toContain('1');

    const secondToast = store.toasts()[0];
    store.runToastAction(secondToast.id);

    expect(store.roomById('2')).toBeDefined();
    expect(getDevice('1').roomId).toBe('2');
    expect(getDevice('5').roomId).toBe('2');
  });

  it('settles pending deletions before a reload, so removed devices stay removed', async () => {
    store.removeDevice('1');
    expect(api.deletedDeviceIds).toEqual([]);

    await store.load();

    expect(api.deletedDeviceIds).toEqual(['1']);
    expect(store.deviceById('1')).toBeUndefined();
    expect(store.toasts().length).toBe(0);
  });

  it('undo does not override a move the user made in the meantime', () => {
    store.deleteRoom('1', '2');
    store.moveDevice('1', '3');

    store.runToastAction(store.toasts()[0].id);

    expect(getDevice('1').roomId).toBe('3'); // user's move kept
    expect(getDevice('2').roomId).toBe('1'); // rest restored
  });

  it('pauses the countdown while hovered or focused and resumes with the remaining time', async () => {
    vi.useFakeTimers();
    try {
      store.removeDevice('1');
      const toast = store.toasts()[0];

      vi.advanceTimersByTime(5_000);
      store.pauseToast(toast.id);
      expect(store.pausedToasts().has(toast.id)).toBe(true);

      vi.advanceTimersByTime(60_000); // paused — nothing happens
      expect(store.toasts().length).toBe(1);

      store.resumeToast(toast.id);
      vi.advanceTimersByTime(4_999);
      expect(store.toasts().length).toBe(1);
      await vi.advanceTimersByTimeAsync(2);
      expect(store.toasts().length).toBe(0);
      expect(api.deletedDeviceIds).toEqual(['1']);
    } finally {
      vi.useRealTimers();
    }
  });
});
