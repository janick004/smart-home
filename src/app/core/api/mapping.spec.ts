import { DeviceDetailDto, DeviceDto, EventLogDto, SensorDataDto } from './api-types';
import {
  COMMAND_EVENT_TYPE,
  groupLatestCommands,
  groupLatestReadings,
  mapDevice,
  parseApiDate,
  parseCommand,
  parseDeviceKind,
  toApiTimestamp,
  toDeviceUpdateDto,
} from './mapping';

/**
 * The translation between the API and the domain. These tests pin down the three
 * things the API does differently from what the app expects: timestamps without
 * a timezone, on/off that has to be read out of an event description, and a
 * device list without MAC/IP/registration date.
 */
describe('parseApiDate', () => {
  it('reads a timestamp without a timezone as UTC', () => {
    expect(parseApiDate('2026-08-18T11:50:51').toISOString()).toBe('2026-08-18T11:50:51.000Z');
  });

  it('leaves an explicit zone alone', () => {
    expect(parseApiDate('2026-08-18T11:50:51Z').toISOString()).toBe('2026-08-18T11:50:51.000Z');
    expect(parseApiDate('2026-08-18T13:50:51+02:00').toISOString()).toBe(
      '2026-08-18T11:50:51.000Z',
    );
  });
});

describe('toApiTimestamp', () => {
  it('sends UTC without a zone, so the server compares against naive UTC rows', () => {
    expect(toApiTimestamp(new Date('2026-08-18T11:50:51.123Z'))).toBe('2026-08-18T11:50:51');
  });
});

describe('parseCommand', () => {
  it('pulls the command out of the description the API writes', () => {
    expect(parseCommand("Command 'ON' issued to device 'Loftlampe'.")).toBe('ON');
    expect(parseCommand("Command 'OFF' issued to device 'Gulvlampe'.")).toBe('OFF');
  });

  it('gives null for anything else', () => {
    expect(parseCommand('Device stopped responding.')).toBeNull();
    expect(parseCommand(null)).toBeNull();
  });
});

describe('parseDeviceKind', () => {
  it('accepts the app types and the common aliases', () => {
    expect(parseDeviceKind('lamp')).toBe('lamp');
    expect(parseDeviceKind('Light')).toBe('lamp');
    expect(parseDeviceKind('temperature')).toBe('thermometer');
    expect(parseDeviceKind('PIR')).toBe('motion');
  });

  it('gives null for a type the app has no tile for', () => {
    expect(parseDeviceKind('camera')).toBeNull();
  });
});

describe('mapDevice', () => {
  const listDto: DeviceDto = {
    deviceId: 1,
    name: 'Loftlampe',
    type: 'lamp',
    roomId: 2,
    roomName: 'Stue',
    status: 'Online',
    lastSeen: '2026-08-18T11:50:51',
  };
  const command: EventLogDto = {
    eventId: 9,
    deviceId: 1,
    deviceName: 'Loftlampe',
    event: COMMAND_EVENT_TYPE,
    description: "Command 'ON' issued to device 'Loftlampe'.",
    timestamp: '2026-08-18T11:40:51',
  };

  it('turns numeric ids into the domain strings and reads Online', () => {
    const device = mapDevice(listDto, {}, null);
    expect(device).toMatchObject({ id: '1', roomId: '2', online: true });
  });

  it('derives a lamp being on from the latest recorded command', () => {
    expect(mapDevice(listDto, {}, command)).toMatchObject({ kind: 'lamp', on: true });
    expect(
      mapDevice(listDto, {}, { ...command, description: "Command 'OFF' issued to it." }),
    ).toMatchObject({ on: false });
    // No command in the log at all: the lamp reads as off.
    expect(mapDevice(listDto, {}, null)).toMatchObject({ on: false });
  });

  it('has no MAC, IP or registration date from the list — and keeps them from the detail', () => {
    const fromList = mapDevice(listDto, {}, null);
    expect(fromList).toMatchObject({ mac: null, ip: null, registeredAt: null });

    const detailDto: DeviceDetailDto = {
      ...listDto,
      macAddress: 'AA:BB:CC:00:00:01',
      iPv4Address: '192.168.1.51',
      registrationDate: '2026-05-29T11:52:51',
    };
    const fromDetail = mapDevice(detailDto, {}, null);
    expect(fromDetail).toMatchObject({ mac: 'AA:BB:CC:00:00:01', ip: '192.168.1.51' });
    expect(fromDetail?.registeredAt?.toISOString()).toBe('2026-05-29T11:52:51.000Z');

    // A later list reload must not blank the technical fields out again.
    const reloaded = mapDevice(listDto, {}, null, fromDetail ?? undefined);
    expect(reloaded).toMatchObject({ mac: 'AA:BB:CC:00:00:01', ip: '192.168.1.51' });
  });

  it('has no "updated" time for a device that has never reported anything', () => {
    // Registration does not count as a sign of life: otherwise a brand new
    // device would read as "opdateret lige nu", as if a reading had arrived.
    const device = mapDevice({ ...listDto, lastSeen: null }, {}, null);
    expect(device?.updatedAt).toBeNull();
  });

  it('uses lastSeen when there is neither a reading nor a command', () => {
    const device = mapDevice(listDto, {}, null);
    expect(device?.updatedAt?.toISOString()).toBe('2026-08-18T11:50:51.000Z');
  });

  it('separates "we got data" from "we merely saw it"', () => {
    // Only lastSeen: the device is alive but has not sent anything.
    expect(mapDevice(listDto, {}, null)).toMatchObject({ updatedFrom: 'seen' });
    // A command is new data.
    expect(mapDevice(listDto, {}, command)).toMatchObject({ updatedFrom: 'data' });
    // A reading is new data too.
    const reading = {
      dataId: 1,
      deviceId: 1,
      sensorType: 'temperature',
      value: 21,
      unit: '°C',
      timestamp: '2026-08-18T12:00:00',
    };
    expect(
      mapDevice({ ...listDto, type: 'thermometer' }, { temperature: reading }, null),
    ).toMatchObject({ updatedFrom: 'data' });
  });

  it('gives null for a device type the app cannot show', () => {
    expect(mapDevice({ ...listDto, type: 'camera' }, {}, null)).toBeNull();
  });
});

describe('grouping helpers', () => {
  const sample = (
    deviceId: number,
    sensorType: string,
    value: number,
    timestamp: string,
  ): SensorDataDto => ({ dataId: value, deviceId, sensorType, value, unit: '°C', timestamp });

  it('keeps the newest reading per device per sensor type', () => {
    const readings = groupLatestReadings([
      sample(3, 'temperature', 19, '2026-08-18T09:00:00'),
      sample(3, 'temperature', 21, '2026-08-18T11:00:00'),
      sample(3, 'humidity', 43, '2026-08-18T11:00:00'),
      sample(4, 'light', 1, '2026-08-18T11:00:00'),
    ]);
    expect(readings.get('3')?.temperature?.value).toBe(21);
    expect(readings.get('3')?.humidity?.value).toBe(43);
    // 'light' has no tile in the app and is dropped.
    expect(readings.get('4')).toBeUndefined();
  });

  it('keeps only the newest command event per device', () => {
    const event = (deviceId: number, description: string, timestamp: string): EventLogDto => ({
      eventId: 1,
      deviceId,
      deviceName: null,
      event: COMMAND_EVENT_TYPE,
      description,
      timestamp,
    });
    const commands = groupLatestCommands([
      event(1, "Command 'ON' issued.", '2026-08-18T09:00:00'),
      event(1, "Command 'OFF' issued.", '2026-08-18T10:00:00'),
      {
        eventId: 2,
        deviceId: 1,
        deviceName: null,
        event: 'DeviceRegistered',
        description: 'noise',
        timestamp: '2026-08-18T23:00:00',
      },
    ]);
    expect(parseCommand(commands.get('1')?.description ?? null)).toBe('OFF');
  });
});

describe('toDeviceUpdateDto', () => {
  it('builds the full replacement body the API requires', () => {
    const device = mapDevice(
      {
        deviceId: 7,
        name: 'Natlampe',
        type: 'lamp',
        roomId: 3,
        roomName: 'Soveværelse',
        status: 'Online',
        lastSeen: null,
      },
      {},
      null,
    );
    expect(toDeviceUpdateDto(device!)).toEqual({
      name: 'Natlampe',
      type: 'lamp',
      roomId: 3,
      iPv4Address: null,
    });
  });
});
