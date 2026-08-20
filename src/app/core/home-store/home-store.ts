import { computed, inject, Injectable, signal } from '@angular/core';
import {
  groupLatestCommands,
  groupLatestReadings,
  mapDevice,
  mapRoom,
  parseDeviceKind,
  toApiDeviceType,
  toApiId,
  toDeviceUpdateDto,
} from '../api/mapping';
import { SmartHomeApi } from '../api/smart-home-api';
import { Device, DeviceKind, Room, Toast, ToastAction } from '../models';

export interface NewDeviceDraft {
  readonly name: string;
  readonly roomId: string;
  readonly kind: DeviceKind;
  /** The device's physical identity — required by POST /devices. */
  readonly mac: string;
  readonly ip?: string;
}

export interface ShowToastInput {
  readonly message: string;
  readonly variant: Toast['variant'];
  readonly ttlMs?: number;
  readonly action?: ToastAction;
  /**
   * Runs when the toast expires naturally (or is force-committed), but NOT when
   * the user runs the toast's action. Destructive server calls live here, so
   * "Fortryd" can cancel them before they ever reach the API.
   */
  readonly onExpire?: () => void;
}

export type StoreStatus = 'loading' | 'ready' | 'error';

/** How long an undo toast stays: "fortryd i 10 sekunder". */
export const UNDO_TTL_MS = 10_000;
const NOTICE_TTL_MS = 4_000;
const RETRY_TTL_MS = 8_000;
/**
 * Current readings and lamp state come from the API's windowless `/latest`
 * endpoints, NOT from a "newest N rows in the last X hours" query. That query
 * shape made values move on their own: the newest 1000 rows for the whole house
 * cover less and less time as devices are added, so a device could drop out of
 * the window and read as "no data" without anything having happened — and since
 * the window depends on the filter, the home page and the device dialog could
 * disagree about the very same device. See docs/API-NOTES.md.
 */

interface ToastTimer {
  handle: ReturnType<typeof setTimeout> | null;
  remainingMs: number;
  resumedAt: number;
}

interface PendingDeviceDeletion {
  readonly device: Device;
  readonly roomName: string;
}

/**
 * All home state lives here as signals, loaded from and written through the
 * documented REST API (SmartHomeApi). Destructive calls (DELETE) are deferred
 * until the undo window has passed — the API has no soft delete, so this is
 * what keeps "Fortryd" honest. See docs/API-NOTES.md.
 */
@Injectable({ providedIn: 'root' })
export class HomeStore {
  private readonly api = inject(SmartHomeApi);

  private readonly statusState = signal<StoreStatus>('loading');
  private readonly roomsState = signal<readonly Room[]>([]);
  private readonly devicesState = signal<readonly Device[]>([]);
  /** deviceId -> the on/off value a command in flight is trying to reach. */
  private readonly pendingSwitchState = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly toastsState = signal<readonly Toast[]>([]);
  private readonly pausedToastsState = signal<ReadonlySet<number>>(new Set());

  private readonly toastTimers = new Map<number, ToastTimer>();
  private readonly toastExpireActions = new Map<number, () => void>();
  /** Devices captured by a pending room-deletion undo, per toast id. */
  private readonly roomUndoDevices = new Map<number, ReadonlySet<string>>();
  /** Deferred single-device deletions, per toast id. */
  private readonly pendingDeviceDeletions = new Map<number, PendingDeviceDeletion>();
  /** Deferred DELETEs currently running against the API. */
  private readonly inFlightCommits = new Set<Promise<void>>();
  private toastSeq = 0;

  readonly status = this.statusState.asReadonly();
  readonly rooms = this.roomsState.asReadonly();
  readonly devices = this.devicesState.asReadonly();
  readonly pendingSwitch = this.pendingSwitchState.asReadonly();
  readonly toasts = this.toastsState.asReadonly();
  readonly pausedToasts = this.pausedToastsState.asReadonly();

  /**
   * Only lamps that are BOTH on and responding. A dead lamp with an old
   * on-command in the log would otherwise read as lit on the front page, while
   * the same lamp reads as "Svarer ikke" in the device list.
   */
  readonly lampsOnCount = computed(
    () =>
      this.devicesState().filter((device) => device.kind === 'lamp' && device.online && device.on)
        .length,
  );

  readonly offlineDevices = computed(() => this.devicesState().filter((device) => !device.online));

  constructor() {
    void this.load();
  }

  /**
   * Loads the whole home: rooms, devices, the latest sensor samples, and the
   * latest recorded commands (the API's only on/off signal for lamps).
   */
  async load(): Promise<void> {
    this.statusState.set('loading');
    // Settle deferred destructive work first — otherwise the fetch below would
    // resurrect devices/rooms the user already removed but whose DELETE is
    // still waiting for the undo window.
    for (const id of [...this.toastExpireActions.keys()]) {
      this.expireToast(id);
    }
    await Promise.allSettled([...this.inFlightCommits]);
    try {
      const [roomDtos, deviceDtos] = await Promise.all([
        this.api.getRooms(),
        this.api.getDevices(),
      ]);
      const [samples, commandEvents] = await Promise.all([
        this.api.getLatestSensorData(),
        this.api.getLatestCommands(),
      ]);
      const readings = groupLatestReadings(samples);
      const commands = groupLatestCommands(commandEvents);
      // The list has neither MAC, IP nor registration date — keep them from the
      // detail we already fetched, so the technical card is not emptied on reload.
      const known = new Map(this.devicesState().map((device) => [device.id, device]));
      this.roomsState.set(roomDtos.map(mapRoom));
      this.devicesState.set(
        deviceDtos.flatMap((dto) => {
          const id = String(dto.deviceId);
          const device = mapDevice(
            dto,
            readings.get(id) ?? {},
            commands.get(id) ?? null,
            known.get(id),
          );
          if (device === null) {
            // The database can hold types the app has no tile for.
            console.warn(`Device "${dto.name}" has unknown type "${dto.type}" and is not shown`);
            return [];
          }
          return [device];
        }),
      );
      this.statusState.set('ready');
    } catch (error) {
      console.error('Loading the home from the API failed', error);
      this.statusState.set('error');
    }
  }

  roomById(id: string): Room | undefined {
    return this.roomsState().find((room) => room.id === id);
  }

  deviceById(id: string): Device | undefined {
    return this.devicesState().find((device) => device.id === id);
  }

  devicesInRoom(roomId: string): readonly Device[] {
    return this.devicesState().filter((device) => device.roomId === roomId);
  }

  /** Re-fetches one device (plus readings) — the closest the API has to a ping. */
  async refreshDevice(deviceId: string): Promise<Device | null> {
    try {
      const dto = await this.api.getDevice(deviceId);
      // Deliberately the SAME two calls as load(), just narrowed to one device:
      // if the two paths asked differently they could disagree about the value.
      const [samples, events] = await Promise.all([
        this.api.getLatestSensorData(deviceId),
        parseDeviceKind(dto.type) === 'lamp'
          ? this.api.getLatestCommands(deviceId)
          : Promise.resolve([]),
      ]);
      const readings = groupLatestReadings(samples).get(deviceId) ?? {};
      const command = groupLatestCommands(events).get(deviceId) ?? null;
      const device = mapDevice(dto, readings, command, this.deviceById(deviceId));
      if (device === null) {
        return null;
      }
      this.devicesState.update((devices) => devices.map((d) => (d.id === deviceId ? device : d)));
      return device;
    } catch (error) {
      console.error('Refreshing the device failed', deviceId, error);
      return null;
    }
  }

  // ---- Lamps: optimistic switching with rollback ----

  /**
   * Flips the lamp immediately, then sends the command. If the API rejects it,
   * the switch rolls back and a toast says why (mockup 05).
   */
  toggleLamp(deviceId: string): void {
    void this.runSwitchCommand(deviceId);
  }

  /** Turns every online lamp on or off; each lamp is its own command. */
  setAllLamps(on: boolean): void {
    for (const device of this.devicesState()) {
      if (
        device.kind === 'lamp' &&
        device.online &&
        device.on !== on &&
        !this.pendingSwitchState().has(device.id)
      ) {
        this.toggleLamp(device.id);
      }
    }
  }

  private async runSwitchCommand(deviceId: string): Promise<void> {
    const device = this.deviceById(deviceId);
    if (!device || device.kind !== 'lamp') {
      return;
    }
    if (this.pendingSwitchState().has(deviceId)) {
      return; // one command per lamp at a time
    }
    const wasOn = device.on;
    const target = !wasOn;

    this.setPendingSwitch(deviceId, target);
    this.mapDeviceInState(deviceId, (d) => (d.kind === 'lamp' ? { ...d, on: target } : d));

    let ok = false;
    try {
      await this.api.sendDeviceCommand(deviceId, { command: target ? 'ON' : 'OFF' });
      ok = true;
    } catch {
      // Not swallowed: the rollback and retry toast below surface it to the user.
      ok = false;
    }

    this.clearPendingSwitch(deviceId);
    const current = this.deviceById(deviceId);
    if (!current || current.kind !== 'lamp') {
      return; // removed while the command was in flight
    }
    if (ok) {
      this.mapDeviceInState(deviceId, (d) => ({
        ...d,
        updatedAt: new Date(),
        updatedFrom: 'data' as const,
      }));
    } else {
      this.mapDeviceInState(deviceId, (d) => (d.kind === 'lamp' ? { ...d, on: wasOn } : d));
      this.showToast({
        message: wasOn
          ? $localize`:rollback toast after a failed lamp command; the lamp is still on@@store.lampNoAnswerStillOn:${device.name}:name: svarede ikke — den er stadig tændt`
          : $localize`:rollback toast after a failed lamp command; the lamp is still off@@store.lampNoAnswerStillOff:${device.name}:name: svarede ikke — den er stadig slukket`,
        variant: 'alert',
        ttlMs: RETRY_TTL_MS,
        action: {
          label: $localize`:retry a failed lamp command@@store.retry:Prøv igen`,
          run: () => this.toggleLamp(deviceId),
        },
      });
    }
  }

  // ---- Rooms ----

  async addRoom(name: string): Promise<Room | null> {
    try {
      const dto = await this.api.createRoom({ name: name.trim() });
      const room = mapRoom(dto);
      this.roomsState.update((rooms) => [...rooms, room]);
      return room;
    } catch (error) {
      console.error('Creating the room failed', error);
      this.showToast({
        message: $localize`:error toast@@store.roomCreateFailed:Rummet kunne ikke oprettes — prøv igen`,
        variant: 'alert',
      });
      return null;
    }
  }

  renameRoom(roomId: string, name: string): void {
    const room = this.roomById(roomId);
    const trimmed = name.trim();
    if (!room || trimmed === '') {
      return;
    }
    const previousName = room.name;
    this.roomsState.update((rooms) =>
      rooms.map((r) => (r.id === roomId ? { ...r, name: trimmed } : r)),
    );
    void this.api.updateRoom(roomId, { name: trimmed }).catch((error: unknown) => {
      console.error('Renaming the room failed', roomId, error);
      this.roomsState.update((rooms) =>
        rooms.map((r) => (r.id === roomId ? { ...r, name: previousName } : r)),
      );
      this.showToast({
        message: $localize`:error toast@@store.renameFailed:Navnet kunne ikke gemmes — prøv igen`,
        variant: 'alert',
      });
    });
  }

  /**
   * Deletes a room. Devices are moved to `moveToRoomId` right away (PUT) when
   * given; otherwise they follow the room. The room's own DELETE — and any
   * device DELETEs — wait until the undo window has passed.
   */
  deleteRoom(roomId: string, moveToRoomId: string | null): void {
    const room = this.roomById(roomId);
    if (!room) {
      return;
    }
    // Deferred single-device deletions in this room must hit the server first,
    // otherwise the deferred room delete would 409 on a device we think is gone.
    for (const [toastId, pending] of [...this.pendingDeviceDeletions]) {
      if (pending.device.roomId === roomId) {
        this.expireToast(toastId);
      }
    }
    const affected = this.devicesInRoom(roomId);
    const affectedIds = new Set(affected.map((device) => device.id));
    // An older pending room-undo that captured any of these devices can no longer
    // restore faithfully — commit it now instead of offering a misleading Fortryd.
    for (const [toastId, capturedIds] of [...this.roomUndoDevices]) {
      if ([...capturedIds].some((id) => affectedIds.has(id))) {
        this.expireToast(toastId);
      }
    }
    const moveTarget =
      moveToRoomId !== null && moveToRoomId !== roomId && this.roomById(moveToRoomId)
        ? moveToRoomId
        : null;

    if (moveTarget !== null) {
      this.devicesState.update((devices) =>
        devices.map((device) =>
          device.roomId === roomId ? { ...device, roomId: moveTarget } : device,
        ),
      );
      for (const device of affected) {
        void this.api
          .updateDevice(device.id, toDeviceUpdateDto({ ...device, roomId: moveTarget }))
          .catch((error: unknown) => {
            console.error('Moving a device out of the deleted room failed', device.id, error);
          });
      }
    } else {
      this.devicesState.update((devices) => devices.filter((device) => device.roomId !== roomId));
    }
    this.roomsState.update((rooms) => rooms.filter((r) => r.id !== roomId));

    const toastId = this.showToast({
      message: $localize`:undo toast after deleting a room@@store.roomDeleted:${room.name}:name: er slettet`,
      variant: 'neutral',
      ttlMs: UNDO_TTL_MS,
      action: {
        label: $localize`:undo action on a toast@@store.undo:Fortryd`,
        run: () => {
          if (!this.roomById(room.id)) {
            // The server-side delete never ran, so the room still exists there.
            this.roomsState.update((rooms) => [...rooms, room]);
          }
          if (moveTarget !== null) {
            // Only re-home devices still sitting where the deletion put them —
            // a move the user made in the meantime must not be reverted.
            const toMoveBack = this.devicesState().filter(
              (device) => affectedIds.has(device.id) && device.roomId === moveTarget,
            );
            this.devicesState.update((devices) =>
              devices.map((device) =>
                affectedIds.has(device.id) && device.roomId === moveTarget
                  ? { ...device, roomId: room.id }
                  : device,
              ),
            );
            for (const device of toMoveBack) {
              void this.api
                .updateDevice(device.id, toDeviceUpdateDto({ ...device, roomId: room.id }))
                .catch((error: unknown) => {
                  console.error('Moving a device back after undo failed', device.id, error);
                });
            }
          } else {
            this.devicesState.update((devices) => [
              ...devices,
              ...affected.filter((device) => !devices.some((d) => d.id === device.id)),
            ]);
          }
        },
      },
      onExpire: () =>
        this.trackCommit(this.commitRoomDeletion(room, moveTarget === null ? affected : [])),
    });
    this.roomUndoDevices.set(toastId, affectedIds);
  }

  private async commitRoomDeletion(room: Room, devicesToDelete: readonly Device[]): Promise<void> {
    try {
      await Promise.all(devicesToDelete.map((device) => this.api.deleteDevice(device.id)));
      await this.api.deleteRoom(room.id);
    } catch (error) {
      console.error('Deleting the room on the server failed', room.id, error);
      this.showToast({
        message: $localize`:error toast; the app resyncs from the API@@store.roomDeleteFailed:${room.name}:name: kunne ikke slettes — henter hjemmet igen`,
        variant: 'alert',
      });
      void this.load();
    }
  }

  // ---- Devices ----

  async addDevice(draft: NewDeviceDraft): Promise<Device | null> {
    try {
      const dto = await this.api.registerDevice({
        name: draft.name.trim(),
        type: toApiDeviceType(draft.kind),
        roomId: toApiId(draft.roomId),
        macAddress: draft.mac,
        ...(draft.ip !== undefined ? { iPv4Address: draft.ip } : {}),
      });
      const device = mapDevice(dto, {}, null);
      if (device === null) {
        throw new Error(`The API answered with an unknown device type "${dto.type}"`);
      }
      this.devicesState.update((devices) => [...devices, device]);
      return device;
    } catch (error) {
      console.error('Registering the device failed', error);
      this.showToast({
        message: $localize`:error toast@@store.deviceCreateFailed:Enheden kunne ikke tilføjes — prøv igen`,
        variant: 'alert',
      });
      return null;
    }
  }

  renameDevice(deviceId: string, name: string): void {
    const device = this.deviceById(deviceId);
    const trimmed = name.trim();
    if (!device || trimmed === '') {
      return;
    }
    const previousName = device.name;
    this.mapDeviceInState(deviceId, (d) => ({ ...d, name: trimmed }));
    // PUT replaces the whole device, so we send the updated device — not just the name.
    void this.api
      .updateDevice(deviceId, toDeviceUpdateDto({ ...device, name: trimmed }))
      .catch((error: unknown) => {
        console.error('Renaming the device failed', deviceId, error);
        this.mapDeviceInState(deviceId, (d) => ({ ...d, name: previousName }));
        this.showToast({
          message: $localize`:error toast@@store.renameFailed:Navnet kunne ikke gemmes — prøv igen`,
          variant: 'alert',
        });
      });
  }

  moveDevice(deviceId: string, roomId: string): void {
    const device = this.deviceById(deviceId);
    if (!device || !this.roomById(roomId)) {
      return;
    }
    const previousRoomId = device.roomId;
    this.mapDeviceInState(deviceId, (d) => ({ ...d, roomId }));
    void this.api
      .updateDevice(deviceId, toDeviceUpdateDto({ ...device, roomId }))
      .catch((error: unknown) => {
        console.error('Moving the device failed', deviceId, error);
        this.mapDeviceInState(deviceId, (d) => ({ ...d, roomId: previousRoomId }));
        this.showToast({
          message: $localize`:error toast@@store.moveFailed:${device.name}:name: kunne ikke flyttes — prøv igen`,
          variant: 'alert',
        });
      });
  }

  /**
   * Removes right away in the UI — no confirm dialog — and offers undo for
   * 10 seconds. The DELETE only reaches the API when the window has passed.
   */
  removeDevice(deviceId: string): void {
    const device = this.deviceById(deviceId);
    if (!device) {
      return;
    }
    const roomName = this.roomById(device.roomId)?.name ?? '';
    this.devicesState.update((devices) => devices.filter((d) => d.id !== deviceId));
    const toastId = this.showToast({
      message: $localize`:undo toast after removing a device@@store.deviceRemoved:${device.name}:name: er fjernet`,
      variant: 'neutral',
      ttlMs: UNDO_TTL_MS,
      action: {
        label: $localize`:undo action on a toast@@store.undo:Fortryd`,
        run: () => this.restoreDevice(device, roomName),
      },
      onExpire: () => this.trackCommit(this.commitDeviceDeletion(device, roomName)),
    });
    this.pendingDeviceDeletions.set(toastId, { device, roomName });
  }

  private async commitDeviceDeletion(device: Device, roomName: string): Promise<void> {
    try {
      await this.api.deleteDevice(device.id);
    } catch (error) {
      console.error('Deleting the device on the server failed', device.id, error);
      this.restoreDevice(device, roomName);
      this.showToast({
        message: $localize`:error toast; the device reappears@@store.deviceDeleteFailed:${device.name}:name: kunne ikke fjernes — den er lagt tilbage`,
        variant: 'alert',
      });
    }
  }

  private restoreDevice(device: Device, roomName: string): void {
    if (this.deviceById(device.id)) {
      return;
    }
    if (!this.roomById(device.roomId)) {
      // The room went away client-side in the meantime; bring it back so the
      // device has a home (its server-side delete may still be pending).
      this.roomsState.update((rooms) => [...rooms, { id: device.roomId, name: roomName }]);
    }
    this.devicesState.update((devices) => [...devices, device]);
  }

  // ---- Toasts ----

  showToast(input: ShowToastInput): number {
    const id = ++this.toastSeq;
    const ttlMs = input.ttlMs ?? NOTICE_TTL_MS;
    const toast: Toast =
      input.action !== undefined
        ? { id, message: input.message, variant: input.variant, ttlMs, action: input.action }
        : { id, message: input.message, variant: input.variant, ttlMs };
    this.toastsState.update((toasts) => [...toasts, toast]);
    if (input.onExpire !== undefined) {
      this.toastExpireActions.set(id, input.onExpire);
    }
    this.toastTimers.set(id, {
      handle: setTimeout(() => this.expireToast(id), ttlMs),
      remainingMs: ttlMs,
      resumedAt: Date.now(),
    });
    return id;
  }

  /** Hovering or focusing a toast pauses the countdown, so the action stays reachable. */
  pauseToast(id: number): void {
    const timer = this.toastTimers.get(id);
    if (!timer || timer.handle === null) {
      return;
    }
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remainingMs = Math.max(0, timer.remainingMs - (Date.now() - timer.resumedAt));
    this.pausedToastsState.update((paused) => new Set(paused).add(id));
  }

  resumeToast(id: number): void {
    const timer = this.toastTimers.get(id);
    if (!timer || timer.handle !== null) {
      return;
    }
    timer.resumedAt = Date.now();
    timer.handle = setTimeout(() => this.expireToast(id), timer.remainingMs);
    this.pausedToastsState.update((paused) => {
      const next = new Set(paused);
      next.delete(id);
      return next;
    });
  }

  /** Natural expiry or a forced early commit: runs the deferred work, then removes. */
  private expireToast(id: number): void {
    const commit = this.toastExpireActions.get(id);
    this.removeToast(id);
    commit?.();
  }

  /** Cancels a toast without running its deferred work (the undo path). */
  dismissToast(id: number): void {
    this.removeToast(id);
  }

  /** Runs the toast's action (e.g. Fortryd) and cancels any deferred work. */
  runToastAction(id: number): void {
    const toast = this.toastsState().find((t) => t.id === id);
    if (!toast?.action) {
      return;
    }
    this.dismissToast(id);
    toast.action.run();
  }

  private removeToast(id: number): void {
    const timer = this.toastTimers.get(id);
    if (timer) {
      if (timer.handle !== null) {
        clearTimeout(timer.handle);
      }
      this.toastTimers.delete(id);
    }
    this.toastExpireActions.delete(id);
    this.roomUndoDevices.delete(id);
    this.pendingDeviceDeletions.delete(id);
    if (this.pausedToastsState().has(id)) {
      this.pausedToastsState.update((paused) => {
        const next = new Set(paused);
        next.delete(id);
        return next;
      });
    }
    this.toastsState.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  // ---- Internals ----

  /** Registers a deferred commit so load() can wait for it before resyncing. */
  private trackCommit(commit: Promise<void>): void {
    this.inFlightCommits.add(commit);
    void commit.finally(() => this.inFlightCommits.delete(commit));
  }

  private mapDeviceInState(deviceId: string, project: (device: Device) => Device): void {
    this.devicesState.update((devices) =>
      devices.map((device) => (device.id === deviceId ? project(device) : device)),
    );
  }

  private setPendingSwitch(deviceId: string, target: boolean): void {
    this.pendingSwitchState.update((pending) => new Map(pending).set(deviceId, target));
  }

  private clearPendingSwitch(deviceId: string): void {
    this.pendingSwitchState.update((pending) => {
      const next = new Map(pending);
      next.delete(deviceId);
      return next;
    });
  }
}
