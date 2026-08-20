import {
  DeviceCommandAcceptedDto,
  DeviceCommandDto,
  DeviceCreateDto,
  DeviceDetailDto,
  DeviceDto,
  DeviceStatusDto,
  DeviceUpdateDto,
  EventLogDto,
  EventLogQuery,
  RoomDto,
  RoomWriteDto,
  SensorDataDto,
  SensorDataQuery,
} from '../core/api/api-types';
import { COMMAND_EVENT_TYPE, toApiTimestamp } from '../core/api/mapping';

/**
 * Immediate, deterministic stand-in for SmartHomeApi in unit tests. The same
 * home as the mock backend, but with no delay and no randomness — and with the
 * API's real shapes: integer ids, 'Online'/'Offline', timestamps without a
 * timezone, and the technical fields ONLY in the detail response.
 */
export class SmartHomeApiStub {
  rooms: RoomDto[];
  devices: DeviceDetailDto[];
  samples: SensorDataDto[];
  events: EventLogDto[];

  readonly deletedDeviceIds: string[] = [];
  readonly deletedRoomIds: string[] = [];
  commandCalls = 0;
  commandImpl: (id: string, body: DeviceCommandDto) => Promise<DeviceCommandAcceptedDto> = (
    id,
    body,
  ) => Promise.resolve({ message: `Command '${body.command}' recorded for device ${id}.` });

  private seq = 5000;

  constructor() {
    const now = Date.now();
    const at = (msAgo: number): string => new Date(now - msAgo).toISOString().slice(0, 19);
    const minutes = 60_000;
    const hours = 3_600_000;

    this.rooms = [
      { roomId: 1, name: 'Stue', deviceCount: 4 },
      { roomId: 2, name: 'Køkken', deviceCount: 2 },
      { roomId: 3, name: 'Soveværelse', deviceCount: 2 },
      { roomId: 4, name: 'Badeværelse', deviceCount: 1 },
      { roomId: 5, name: 'Garage', deviceCount: 1 },
    ];

    const device = (
      deviceId: number,
      roomId: number,
      name: string,
      type: string,
      status: DeviceStatusDto = 'Online',
    ): DeviceDetailDto => ({
      deviceId,
      name,
      type,
      roomId,
      roomName: this.rooms.find((room) => room.roomId === roomId)?.name ?? null,
      macAddress: `AA:BB:CC:00:00:${deviceId.toString(16).toUpperCase().padStart(2, '0')}`,
      iPv4Address: '192.168.1.50',
      status,
      registrationDate: at(90 * 24 * hours),
      lastSeen: at(3 * minutes),
    });

    this.devices = [
      device(1, 1, 'Loftlampe', 'lamp'),
      device(2, 1, 'Gulvlampe', 'lamp'),
      device(3, 1, 'Temperatur', 'thermometer'),
      device(4, 1, 'Bevægelse', 'motion'),
      device(5, 2, 'Bordlampe', 'lamp'),
      device(6, 2, 'Temperatur', 'thermometer'),
      device(7, 3, 'Natlampe', 'lamp'),
      device(8, 3, 'Temperatur', 'thermometer'),
      device(9, 4, 'Luftfugtighed', 'humidity'),
      device(10, 5, 'Bevægelsessensor', 'motion', 'Offline'),
    ];

    const sample = (
      deviceId: number,
      sensorType: string,
      value: number,
      unit: string,
      msAgo: number,
    ): SensorDataDto => ({
      dataId: ++this.seq,
      deviceId,
      sensorType,
      value,
      unit,
      timestamp: at(msAgo),
    });
    this.samples = [
      sample(3, 'temperature', 21, '°C', 2 * minutes),
      sample(3, 'humidity', 43, '%', 2 * minutes),
      sample(6, 'temperature', 23, '°C', 4 * minutes),
      sample(8, 'temperature', 20, '°C', 6 * minutes),
      sample(9, 'humidity', 68, '%', 3 * minutes),
      sample(4, 'motion', 1, 'bool', 42 * minutes),
      sample(10, 'motion', 1, 'bool', 27 * hours),
    ];

    const command = (deviceId: number, value: 'ON' | 'OFF', msAgo: number): EventLogDto => ({
      eventId: ++this.seq,
      deviceId,
      deviceName: this.devices.find((d) => d.deviceId === deviceId)?.name ?? null,
      event: COMMAND_EVENT_TYPE,
      description: `Command '${value}' issued to device ${deviceId}.`,
      timestamp: at(msAgo),
    });
    this.events = [
      command(1, 'ON', 12 * minutes),
      command(2, 'OFF', 3 * hours),
      command(5, 'OFF', 5 * hours),
      command(7, 'OFF', 9 * hours),
    ];
  }

  getRooms(): Promise<RoomDto[]> {
    return Promise.resolve([...this.rooms]);
  }

  /** The list shape: no MAC, IP or registration date, just like the API. */
  getDevices(): Promise<DeviceDto[]> {
    return Promise.resolve(this.devices.map((device) => toListDto(device)));
  }

  getDevice(id: string): Promise<DeviceDetailDto> {
    const device = this.devices.find((d) => String(d.deviceId) === id);
    return device ? Promise.resolve({ ...device }) : Promise.reject(new Error('404'));
  }

  /**
   * Faithful to the real endpoint, window and all: newest first, `from`/`deviceId`
   * honoured, and `take` defaulting to the API's 200. That matters — this is the
   * shape that used to make values appear and disappear on their own, so a test
   * that reaches for a "current" value through here SHOULD feel the window.
   */
  querySensorData(query: SensorDataQuery = {}): Promise<SensorDataDto[]> {
    const from = query.from === undefined ? null : toApiTimestamp(query.from);
    return Promise.resolve(
      this.samples
        .filter(
          (sample) =>
            (query.deviceId === undefined || String(sample.deviceId) === query.deviceId) &&
            (query.sensorType === undefined || sample.sensorType === query.sensorType) &&
            (from === null || sample.timestamp >= from),
        )
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.dataId - a.dataId)
        .slice(0, query.take ?? 200),
    );
  }

  queryEventLog(query: EventLogQuery = {}): Promise<EventLogDto[]> {
    const from = query.from === undefined ? null : toApiTimestamp(query.from);
    return Promise.resolve(
      this.events
        .filter(
          (event) =>
            (query.deviceId === undefined || String(event.deviceId) === query.deviceId) &&
            (query.eventType === undefined || event.event === query.eventType) &&
            (from === null || event.timestamp >= from),
        )
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.eventId - a.eventId)
        .slice(0, query.take ?? 200),
    );
  }

  /**
   * Like the API's `/sensordata/latest`: one row per device per sensor type, no
   * window, ties won by the row inserted last. Kept faithful on purpose — the
   * store now depends on this endpoint for every current value it shows.
   */
  getLatestSensorData(deviceId?: string): Promise<SensorDataDto[]> {
    const newest = new Map<string, SensorDataDto>();
    for (const sample of this.samples) {
      if (deviceId !== undefined && String(sample.deviceId) !== deviceId) {
        continue;
      }
      const key = `${sample.deviceId}/${sample.sensorType}`;
      const current = newest.get(key);
      const isNewer =
        current === undefined ||
        (current.timestamp === sample.timestamp
          ? current.dataId < sample.dataId
          : current.timestamp < sample.timestamp);
      if (isNewer) {
        newest.set(key, sample);
      }
    }
    return Promise.resolve([...newest.values()]);
  }

  /** Like the API's `/eventlog/latest?eventType=CommandIssued`. */
  getLatestCommands(deviceId?: string): Promise<EventLogDto[]> {
    const newest = new Map<number, EventLogDto>();
    for (const event of this.events) {
      if (event.deviceId === null) continue;
      if (deviceId !== undefined && String(event.deviceId) !== deviceId) continue;
      if (event.event !== COMMAND_EVENT_TYPE) continue;
      const current = newest.get(event.deviceId);
      const isNewer =
        current === undefined ||
        (current.timestamp === event.timestamp
          ? current.eventId < event.eventId
          : current.timestamp < event.timestamp);
      if (isNewer) {
        newest.set(event.deviceId, event);
      }
    }
    return Promise.resolve([...newest.values()]);
  }

  getDeviceEvents(id: string): Promise<EventLogDto[]> {
    return Promise.resolve(this.events.filter((event) => String(event.deviceId) === id));
  }

  getDeviceHistory(id: string): Promise<SensorDataDto[]> {
    return Promise.resolve(this.samples.filter((sample) => String(sample.deviceId) === id));
  }

  sendDeviceCommand(id: string, body: DeviceCommandDto): Promise<DeviceCommandAcceptedDto> {
    this.commandCalls++;
    return this.commandImpl(id, body);
  }

  createRoom(body: RoomWriteDto): Promise<RoomDto> {
    const room: RoomDto = { roomId: ++this.seq, name: body.name, deviceCount: 0 };
    this.rooms.push(room);
    return Promise.resolve(room);
  }

  updateRoom(id: string, body: RoomWriteDto): Promise<RoomDto> {
    this.rooms = this.rooms.map((room) =>
      String(room.roomId) === id ? { ...room, name: body.name } : room,
    );
    const room = this.rooms.find((r) => String(r.roomId) === id);
    return room ? Promise.resolve(room) : Promise.reject(new Error('404'));
  }

  deleteRoom(id: string): Promise<void> {
    this.deletedRoomIds.push(id);
    this.rooms = this.rooms.filter((room) => String(room.roomId) !== id);
    return Promise.resolve();
  }

  registerDevice(body: DeviceCreateDto): Promise<DeviceDetailDto> {
    const device: DeviceDetailDto = {
      deviceId: ++this.seq,
      name: body.name,
      type: body.type,
      roomId: body.roomId,
      roomName: this.rooms.find((room) => room.roomId === body.roomId)?.name ?? null,
      macAddress: body.macAddress,
      iPv4Address: body.iPv4Address ?? null,
      status: 'Online',
      registrationDate: new Date().toISOString().slice(0, 19),
      lastSeen: new Date().toISOString().slice(0, 19),
    };
    this.devices.push(device);
    return Promise.resolve(device);
  }

  /** PUT is a full replacement — like the API. */
  updateDevice(id: string, body: DeviceUpdateDto): Promise<DeviceDetailDto> {
    this.devices = this.devices.map((device) =>
      String(device.deviceId) === id
        ? {
            ...device,
            name: body.name,
            type: body.type,
            roomId: body.roomId,
            roomName: this.rooms.find((room) => room.roomId === body.roomId)?.name ?? null,
            ...(body.iPv4Address !== undefined && body.iPv4Address !== null
              ? { iPv4Address: body.iPv4Address }
              : {}),
          }
        : device,
    );
    const device = this.devices.find((d) => String(d.deviceId) === id);
    return device ? Promise.resolve(device) : Promise.reject(new Error('404'));
  }

  deleteDevice(id: string): Promise<void> {
    this.deletedDeviceIds.push(id);
    this.devices = this.devices.filter((device) => String(device.deviceId) !== id);
    return Promise.resolve();
  }
}

function toListDto(device: DeviceDetailDto): DeviceDto {
  return {
    deviceId: device.deviceId,
    name: device.name,
    type: device.type,
    roomId: device.roomId,
    roomName: device.roomName,
    status: device.status,
    lastSeen: device.lastSeen,
  };
}
