import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, mergeMap, throwError, timer } from 'rxjs';
import {
  DeviceCommandDto,
  DeviceCreateDto,
  DeviceDto,
  DeviceStatusDto,
  DeviceUpdateDto,
  DiscoveredDeviceDto,
  EventLogCreateDto,
  EventLogDto,
  HistoryRangeDto,
  RoomDto,
  RoomWriteDto,
  SensorDataCreateDto,
  SensorDataDto,
  SensorTypeDto,
} from './api-types';
import { COMMAND_EVENT_TYPE } from './mapping';
import { API_BASE_URL } from './smart-home-api';

/**
 * In-memory stand-in for SmartHomeIoT.Api, so the app can run and be tested
 * without a backend and a database. It mimics what the REAL API does — verified
 * against a running instance: integer ids, `Online`/`Offline`, timestamps
 * without a timezone, 409 while a room still has devices, 409 on a MAC that is
 * already registered, 422 + an event-log entry when a reading is out of range,
 * 202 on a command, and events kept with `deviceId: null` when the device is
 * deleted.
 *
 * Deliberate deviations (so the mock can exercise the UI's error handling):
 * - A command to an offline device fails with 503, and commands to online
 *   devices fail at random per `commandFailureRate`. The real API always
 *   answers 202 — there is no acknowledgement from the device (see
 *   docs/API-NOTES.md).
 * - Looking up a single offline device can find it online again (this stands in
 *   for the ping endpoint the API does not have).
 */
@Injectable({ providedIn: 'root' })
export class MockApiState {
  /** Tunable so tests can make the mock deterministic and instant. */
  commandFailureRate = 0.12;
  offlineRecoveryRate = 0.6;
  minLatencyMs = 120;
  maxLatencyMs = 400;

  private rooms: { roomId: number; name: string }[] = [];
  private devices: {
    deviceId: number;
    name: string;
    type: string;
    roomId: number;
    macAddress: string;
    iPv4Address: string | null;
    status: DeviceStatusDto;
    registrationDate: string;
    lastSeen: string | null;
  }[] = [];
  /**
   * Devices seen on the network but not registered. Stands in for what a hub
   * learns from mDNS or an MQTT announce; `GET /devices/discovered` serves it.
   */
  private discovered: DiscoveredDeviceDto[] = [];
  private sensorData: SensorDataDto[] = [];
  private events: EventLogDto[] = [];
  private seq = 1000;

  constructor() {
    this.seedHome();
  }

  randomLatency(): number {
    return this.minLatencyMs + Math.random() * Math.max(0, this.maxLatencyMs - this.minLatencyMs);
  }

  handle(req: HttpRequest<unknown>, path: string): MockResult {
    const segments = path.split('/').filter((segment) => segment !== '');
    const method = req.method;

    if (segments[0] === 'rooms') {
      if (segments.length === 1) {
        if (method === 'GET') return ok(this.listRooms());
        if (method === 'POST') return this.createRoom(req.body as RoomWriteDto);
      }
      if (segments.length === 2) {
        const id = Number(segments[1]);
        if (method === 'GET') return this.getRoom(id);
        if (method === 'PUT') return this.updateRoom(id, req.body as RoomWriteDto);
        if (method === 'DELETE') return this.deleteRoom(id);
      }
      if (segments.length === 3 && segments[2] === 'devices' && method === 'GET') {
        return this.getRoomDevices(Number(segments[1]));
      }
    }

    if (segments[0] === 'devices') {
      if (segments.length === 1) {
        if (method === 'GET') return ok(this.listDevices(req.params));
        if (method === 'POST') return this.registerDevice(req.body as DeviceCreateDto);
      }
      if (segments.length === 2 && segments[1] === 'discovered' && method === 'GET') {
        return ok([...this.discovered]);
      }
      if (segments.length === 2) {
        const id = Number(segments[1]);
        if (method === 'GET') return this.getDevice(id);
        if (method === 'PUT') return this.updateDevice(id, req.body as DeviceUpdateDto);
        if (method === 'DELETE') return this.deleteDevice(id);
      }
      if (segments.length === 3) {
        const id = Number(segments[1]);
        if (segments[2] === 'history' && method === 'GET') return this.getHistory(id, req.params);
        if (segments[2] === 'events' && method === 'GET') return this.getDeviceEvents(id);
        if (segments[2] === 'command' && method === 'POST') {
          return this.recordCommand(id, req.body as DeviceCommandDto);
        }
      }
    }

    if (segments[0] === 'sensordata') {
      if (segments.length === 1) {
        if (method === 'GET') return ok(this.querySensorData(req.params));
        if (method === 'POST') return this.ingestSensorData(req.body as SensorDataCreateDto);
      }
      if (segments.length === 2 && method === 'DELETE') {
        return this.deleteSensorDataEntry(Number(segments[1]));
      }
    }

    if (segments[0] === 'eventlog' && segments.length === 1) {
      if (method === 'GET') return ok(this.queryEventLog(req.params));
      if (method === 'POST') return this.createEvent(req.body as EventLogCreateDto);
    }

    if (segments[0] === 'dashboard' && segments[1] === 'summary' && method === 'GET') {
      return ok(this.dashboardSummary());
    }

    return {
      status: 404,
      body: { statusCode: 404, message: `No mock route for ${method} /${segments.join('/')}` },
    };
  }

  // ---- Rooms ----

  private listRooms(): RoomDto[] {
    return [...this.rooms]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((room) => ({
        roomId: room.roomId,
        name: room.name,
        deviceCount: this.devices.filter((device) => device.roomId === room.roomId).length,
      }));
  }

  private getRoom(id: number): MockResult {
    const room = this.rooms.find((r) => r.roomId === id);
    if (!room) return notFound(`Room ${id} was not found.`);
    return ok({
      roomId: room.roomId,
      name: room.name,
      devices: this.devices
        .filter((device) => device.roomId === id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((device) => this.toListDto(device)),
    });
  }

  private getRoomDevices(id: number): MockResult {
    if (!this.rooms.some((room) => room.roomId === id))
      return notFound(`Room ${id} was not found.`);
    return ok(
      this.devices
        .filter((device) => device.roomId === id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((device) => this.toListDto(device)),
    );
  }

  private createRoom(body: RoomWriteDto): MockResult {
    const name = body?.name?.trim();
    if (!name) return validationFailed('The Name field is required.');
    const room = { roomId: ++this.seq, name };
    this.rooms.push(room);
    return { status: 201, body: { roomId: room.roomId, name: room.name, deviceCount: 0 } };
  }

  private updateRoom(id: number, body: RoomWriteDto): MockResult {
    const room = this.rooms.find((r) => r.roomId === id);
    if (!room) return notFound(`Room ${id} was not found.`);
    const name = body?.name?.trim();
    if (!name) return validationFailed('The Name field is required.');
    room.name = name;
    return ok({
      roomId: room.roomId,
      name: room.name,
      deviceCount: this.devices.filter((device) => device.roomId === id).length,
    });
  }

  private deleteRoom(id: number): MockResult {
    const room = this.rooms.find((r) => r.roomId === id);
    if (!room) return notFound(`Room ${id} was not found.`);
    const assigned = this.devices.filter((device) => device.roomId === id).length;
    if (assigned > 0) {
      // Like the API: a room cannot be deleted while devices are assigned to it.
      return {
        status: 409,
        body: {
          statusCode: 409,
          message: `Room '${room.name}' still has ${assigned} device(s) assigned. Move or remove them before deleting the room.`,
        },
      };
    }
    this.rooms = this.rooms.filter((r) => r.roomId !== id);
    return { status: 204 };
  }

  // ---- Devices ----

  private listDevices(params: HttpParams): DeviceDto[] {
    const roomId = params.get('roomId');
    const status = params.get('status');
    return this.devices
      .filter(
        (device) =>
          (roomId === null || device.roomId === Number(roomId)) &&
          (status === null || device.status.toLowerCase() === status.toLowerCase()),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((device) => this.toListDto(device));
  }

  private getDevice(id: number): MockResult {
    const device = this.devices.find((d) => d.deviceId === id);
    if (!device) return notFound(`Device ${id} was not found.`);
    // Simulation: a deliberate lookup of an offline device can find it alive again.
    if (device.status === 'Offline' && Math.random() < this.offlineRecoveryRate) {
      device.status = 'Online';
      device.lastSeen = naiveUtc(new Date());
      this.appendEvent(
        device.deviceId,
        'DeviceOnline',
        `Device '${device.name}' came back online.`,
      );
    }
    return ok({ ...device, roomName: this.roomName(device.roomId) });
  }

  private registerDevice(body: DeviceCreateDto): MockResult {
    const name = body?.name?.trim();
    if (!name || !body.type) return validationFailed('Name and Type are required.');
    if (!MAC_PATTERN.test(body.macAddress ?? '')) {
      return validationFailed('MacAddress must be in the form AA:BB:CC:DD:EE:FF.');
    }
    if (!this.rooms.some((room) => room.roomId === body.roomId)) {
      return notFound(`Room ${body.roomId} was not found.`);
    }
    if (this.devices.some((device) => device.macAddress === body.macAddress)) {
      return {
        status: 409,
        body: {
          statusCode: 409,
          message: `A device with MAC address '${body.macAddress}' is already registered.`,
        },
      };
    }
    const now = new Date();
    const device = {
      deviceId: ++this.seq,
      name,
      type: body.type,
      roomId: body.roomId,
      macAddress: body.macAddress,
      iPv4Address: body.iPv4Address ?? null,
      status: 'Online' as DeviceStatusDto,
      registrationDate: naiveUtc(now),
      lastSeen: naiveUtc(now),
    };
    this.devices.push(device);
    // Registering it means it is no longer waiting to be discovered.
    this.discovered = this.discovered.filter((found) => found.macAddress !== body.macAddress);
    // Like the API: the registration event is written WITHOUT a deviceId.
    this.appendEvent(
      null,
      'DeviceRegistered',
      `Device '${device.name}' (${device.macAddress}) was registered and paired to room ${device.roomId}.`,
    );
    return { status: 201, body: { ...device, roomName: this.roomName(device.roomId) } };
  }

  /** PUT is a full replacement — name, type and room must be sent. */
  private updateDevice(id: number, body: DeviceUpdateDto): MockResult {
    const device = this.devices.find((d) => d.deviceId === id);
    if (!device) return notFound(`Device ${id} was not found.`);
    const name = body?.name?.trim();
    if (!name || !body.type || typeof body.roomId !== 'number') {
      return validationFailed('Name, Type and RoomId are required.');
    }
    if (device.roomId !== body.roomId && !this.rooms.some((room) => room.roomId === body.roomId)) {
      return notFound(`Room ${body.roomId} was not found.`);
    }
    device.name = name;
    device.type = body.type;
    device.roomId = body.roomId;
    if (body.iPv4Address !== undefined && body.iPv4Address !== null) {
      device.iPv4Address = body.iPv4Address;
    }
    return ok({ ...device, roomName: this.roomName(device.roomId) });
  }

  private deleteDevice(id: number): MockResult {
    const device = this.devices.find((d) => d.deviceId === id);
    if (!device) return notFound(`Device ${id} was not found.`);
    this.appendEvent(
      null,
      'DeviceRemoved',
      `Device '${device.name}' (${device.macAddress}) was removed from the system.`,
    );
    this.devices = this.devices.filter((d) => d.deviceId !== id);
    // Like the API: the history cascades, events are kept with deviceId = null.
    this.sensorData = this.sensorData.filter((sample) => sample.deviceId !== id);
    this.events = this.events.map((event) =>
      event.deviceId === id ? { ...event, deviceId: null } : event,
    );
    return { status: 204 };
  }

  /** A flat list (oldest first), exactly like the API — not series per sensor type. */
  private getHistory(id: number, params: HttpParams): MockResult {
    if (!this.devices.some((d) => d.deviceId === id))
      return notFound(`Device ${id} was not found.`);
    const range = (params.get('range') ?? '24h') as HistoryRangeDto;
    const hours = range === '24h' ? 24 : range === '7d' ? 7 * 24 : range === '30d' ? 30 * 24 : null;
    if (hours === null) {
      return badRequest(`Unsupported range '${range}'. Use one of: 24h, 7d, 30d.`);
    }
    const sensorType = params.get('sensorType');
    const since = new Date(Date.now() - hours * 3_600_000).toISOString();
    return ok(
      this.sensorData
        .filter(
          (sample) =>
            sample.deviceId === id &&
            (sensorType === null || sample.sensorType === sensorType) &&
            `${sample.timestamp}Z` >= since,
        )
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    );
  }

  private getDeviceEvents(id: number): MockResult {
    if (!this.devices.some((d) => d.deviceId === id))
      return notFound(`Device ${id} was not found.`);
    return ok(
      this.events
        .filter((event) => event.deviceId === id)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    );
  }

  private recordCommand(id: number, body: DeviceCommandDto): MockResult {
    const device = this.devices.find((d) => d.deviceId === id);
    if (!device) return notFound(`Device ${id} was not found.`);
    if (body?.command !== 'ON' && body?.command !== 'OFF') {
      return validationFailed('The Command field is required.');
    }
    if (device.status === 'Offline' || Math.random() < this.commandFailureRate) {
      // Deliberately stricter than the API, so the UI's rollback can be shown.
      return {
        status: 503,
        body: { statusCode: 503, message: 'Device did not acknowledge the command.' },
      };
    }
    this.appendEvent(
      device.deviceId,
      COMMAND_EVENT_TYPE,
      `Command '${body.command}' issued to device '${device.name}'.`,
    );
    return {
      status: 202,
      body: {
        message: `Command '${body.command}' recorded for device ${id}. Dispatch over MQTT topic home/{deviceId}/cmd requires the MQTT publisher integration.`,
      },
      latencyMs: 500 + Math.random() * 700,
    };
  }

  // ---- SensorData ----

  private querySensorData(params: HttpParams): SensorDataDto[] {
    const deviceId = params.get('deviceId');
    const sensorType = params.get('sensorType');
    const from = params.get('from');
    const to = params.get('to');
    const take = clamp(Number(params.get('take') ?? 200), 1, 1000);
    return this.sensorData
      .filter(
        (sample) =>
          (deviceId === null || sample.deviceId === Number(deviceId)) &&
          (sensorType === null || sample.sensorType === sensorType) &&
          (from === null || sample.timestamp >= naiveParam(from)) &&
          (to === null || sample.timestamp <= naiveParam(to)),
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, take);
  }

  private ingestSensorData(body: SensorDataCreateDto): MockResult {
    if (!body?.deviceId || !this.devices.some((d) => d.deviceId === body.deviceId)) {
      return notFound(`Device ${body?.deviceId} was not found.`);
    }
    const rule = SENSOR_RULES[body.sensorType];
    if (rule === undefined) {
      return unprocessable(
        `Unknown sensor type '${body.sensorType}'. Known types: ${Object.keys(SENSOR_RULES).join(', ')}.`,
      );
    }
    if (body.unit?.toLowerCase() !== rule.unit.toLowerCase()) {
      return unprocessable(
        `Unit '${body.unit}' does not match expected unit '${rule.unit}' for sensor type '${body.sensorType}'.`,
      );
    }
    if (body.value < rule.min || body.value > rule.max) {
      // Like the API: a rejected reading is not stored, but is written to the event log.
      this.appendEvent(
        body.deviceId,
        'SensorOutOfRange',
        `Rejected ${body.sensorType} reading ${body.value} ${body.unit}.`,
      );
      return unprocessable(
        `Value ${body.value} is outside the permitted range [${rule.min}, ${rule.max}] for sensor type '${body.sensorType}'.`,
      );
    }
    const sample: SensorDataDto = {
      dataId: ++this.seq,
      deviceId: body.deviceId,
      sensorType: body.sensorType,
      value: body.value,
      unit: body.unit,
      timestamp: body.timestamp ? naiveParam(body.timestamp) : naiveUtc(new Date()),
    };
    this.sensorData.push(sample);
    const device = this.devices.find((d) => d.deviceId === body.deviceId);
    if (device) {
      device.status = 'Online';
      device.lastSeen = sample.timestamp;
    }
    return { status: 201, body: sample };
  }

  private deleteSensorDataEntry(id: number): MockResult {
    if (!this.sensorData.some((sample) => sample.dataId === id)) {
      return notFound(`SensorData ${id} was not found.`);
    }
    this.sensorData = this.sensorData.filter((sample) => sample.dataId !== id);
    return { status: 204 };
  }

  // ---- EventLog ----

  private queryEventLog(params: HttpParams): EventLogDto[] {
    const deviceId = params.get('deviceId');
    const eventType = params.get('eventType');
    const from = params.get('from');
    const to = params.get('to');
    const take = clamp(Number(params.get('take') ?? 200), 1, 1000);
    return this.events
      .filter(
        (event) =>
          (deviceId === null || event.deviceId === Number(deviceId)) &&
          (eventType === null || event.event === eventType) &&
          (from === null || event.timestamp >= naiveParam(from)) &&
          (to === null || event.timestamp <= naiveParam(to)),
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, take);
  }

  private createEvent(body: EventLogCreateDto): MockResult {
    if (!body?.event) return validationFailed('The Event field is required.');
    const event = this.appendEvent(body.deviceId ?? null, body.event, body.description ?? null);
    return { status: 201, body: event };
  }

  // ---- Dashboard ----

  private dashboardSummary() {
    const since = naiveUtc(new Date(Date.now() - 24 * 3_600_000));
    return {
      totalRooms: this.rooms.length,
      totalDevices: this.devices.length,
      onlineDevices: this.devices.filter((device) => device.status === 'Online').length,
      offlineDevices: this.devices.filter((device) => device.status === 'Offline').length,
      measurementsLast24Hours: this.sensorData.filter((sample) => sample.timestamp >= since).length,
      recentEvents: [...this.events]
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, 10),
    };
  }

  // ---- Internals ----

  private roomName(roomId: number): string | null {
    return this.rooms.find((room) => room.roomId === roomId)?.name ?? null;
  }

  private toListDto(device: (typeof this.devices)[number]): DeviceDto {
    // The list shape has neither MAC, IP nor registration date — only the detail does.
    return {
      deviceId: device.deviceId,
      name: device.name,
      type: device.type,
      roomId: device.roomId,
      roomName: this.roomName(device.roomId),
      status: device.status,
      lastSeen: device.lastSeen,
    };
  }

  private appendEvent(
    deviceId: number | null,
    event: string,
    description: string | null,
  ): EventLogDto {
    const entry: EventLogDto = {
      eventId: ++this.seq,
      deviceId,
      deviceName: deviceId === null ? null : this.deviceName(deviceId),
      event,
      description,
      timestamp: naiveUtc(new Date()),
    };
    this.events.push(entry);
    return entry;
  }

  private deviceName(deviceId: number): string | null {
    return this.devices.find((device) => device.deviceId === deviceId)?.name ?? null;
  }

  /** The same home the mockup shows, expressed as API data. */
  private seedHome(): void {
    const now = Date.now();
    const at = (msAgo: number): string => naiveUtc(new Date(now - msAgo));
    const minutes = 60_000;
    const hours = 3_600_000;
    const days = 24 * hours;

    this.rooms = [
      { roomId: 1, name: 'Stue' },
      { roomId: 2, name: 'Køkken' },
      { roomId: 3, name: 'Soveværelse' },
      { roomId: 4, name: 'Badeværelse' },
      { roomId: 5, name: 'Garage' },
    ];

    const device = (
      deviceId: number,
      roomId: number,
      name: string,
      type: string,
      ipLastOctet: number,
      status: DeviceStatusDto = 'Online',
    ) => ({
      deviceId,
      name,
      type,
      roomId,
      macAddress: `AA:BB:CC:00:00:${deviceId.toString(16).toUpperCase().padStart(2, '0')}`,
      iPv4Address: `192.168.1.${ipLastOctet}`,
      status,
      registrationDate: at((30 + ipLastOctet) * days),
      lastSeen: status === 'Online' ? at(3 * minutes) : at(27 * hours),
    });

    this.devices = [
      device(1, 1, 'Loftlampe', 'lamp', 51),
      device(2, 1, 'Gulvlampe', 'lamp', 52),
      device(3, 1, 'Temperatur', 'thermometer', 57),
      device(4, 1, 'Bevægelse', 'motion', 53),
      device(5, 2, 'Bordlampe', 'lamp', 54),
      device(6, 2, 'Temperatur', 'thermometer', 55),
      device(7, 3, 'Natlampe', 'lamp', 56),
      device(8, 3, 'Temperatur', 'thermometer', 58),
      device(9, 4, 'Luftfugtighed', 'humidity', 59),
      device(10, 5, 'Bevægelsessensor', 'motion', 60, 'Offline'),
    ];

    // 30 days of hourly readings per sensor, landing exactly on the mockup's values.
    const numberSeries = (
      deviceId: number,
      sensorType: SensorTypeDto,
      unit: string,
      anchorValue: number,
      anchorMinutesAgo: number,
      amplitude: number,
    ): void => {
      const phase = hashCode(`${deviceId}-${sensorType}`) % 24;
      for (let hour = 30 * 24; hour >= 1; hour--) {
        const timestamp = now - hour * hours;
        const angle = ((new Date(timestamp).getHours() + phase) / 24) * 2 * Math.PI;
        const wobble = Math.sin(hashCode(`${deviceId}-${sensorType}-${hour}`)) * amplitude * 0.25;
        this.sensorData.push({
          dataId: ++this.seq,
          deviceId,
          sensorType,
          value: Math.round((anchorValue + Math.sin(angle) * amplitude + wobble) * 10) / 10,
          unit,
          timestamp: naiveUtc(new Date(timestamp)),
        });
      }
      this.sensorData.push({
        dataId: ++this.seq,
        deviceId,
        sensorType,
        value: anchorValue,
        unit,
        timestamp: at(anchorMinutesAgo * minutes),
      });
    };

    numberSeries(3, 'temperature', '°C', 21, 2, 1.6);
    numberSeries(3, 'humidity', '%', 43, 2, 6);
    numberSeries(6, 'temperature', '°C', 23, 4, 1.6);
    numberSeries(8, 'temperature', '°C', 20, 6, 1.6);
    numberSeries(9, 'humidity', '%', 68, 3, 6);

    // Motion sensors report scattered events (value 1), not a curve.
    const motionSample = (deviceId: number, msAgo: number): void => {
      this.sensorData.push({
        dataId: ++this.seq,
        deviceId,
        sensorType: 'motion',
        value: 1,
        unit: 'bool',
        timestamp: at(msAgo),
      });
    };
    for (let day = 29; day >= 1; day--) {
      motionSample(4, day * days + (hashCode(`m-${day}`) % 10) * hours);
      if (day % 2 === 0) {
        motionSample(10, day * days + (hashCode(`g-${day}`) % 10) * hours);
      }
    }
    // Latest motion in the living room: today (or yesterday) at 14.18, as in the mockup.
    const lastMotion = new Date(now);
    lastMotion.setHours(14, 18, 0, 0);
    if (lastMotion.getTime() > now) {
      lastMotion.setDate(lastMotion.getDate() - 1);
    }
    motionSample(4, now - lastMotion.getTime());
    // The garage sensor went quiet 27 hours ago.
    motionSample(10, 27 * hours);

    // Two finds waiting on the network: one that announces what it is, one that
    // only shows up as a MAC address, so the user has to pick the type.
    this.discovered = [
      {
        macAddress: 'A4:CF:12:AA:01:02',
        iPv4Address: '192.168.1.120',
        type: 'thermometer',
        suggestedName: 'Termometer',
        lastSeen: at(2 * minutes),
      },
      {
        macAddress: 'A4:CF:12:BB:07:31',
        iPv4Address: '192.168.1.134',
        type: null,
        suggestedName: null,
        lastSeen: at(40 * 1000),
      },
    ];

    // Registrations plus the commands the lamps' state is derived from.
    for (const registered of this.devices) {
      this.events.push({
        eventId: ++this.seq,
        deviceId: registered.deviceId,
        deviceName: registered.name,
        event: 'DeviceRegistered',
        description: `Device '${registered.name}' (${registered.macAddress}) was registered.`,
        timestamp: registered.registrationDate,
      });
    }
    const commandEvent = (deviceId: number, command: 'ON' | 'OFF', msAgo: number): void => {
      this.events.push({
        eventId: ++this.seq,
        deviceId,
        deviceName: this.deviceName(deviceId),
        event: COMMAND_EVENT_TYPE,
        description: `Command '${command}' issued to device '${this.deviceName(deviceId)}'.`,
        timestamp: at(msAgo),
      });
    };
    commandEvent(1, 'ON', 12 * minutes);
    commandEvent(2, 'OFF', 3 * hours);
    commandEvent(5, 'OFF', 5 * hours);
    commandEvent(7, 'OFF', 9 * hours);
    this.events.push({
      eventId: ++this.seq,
      deviceId: 10,
      deviceName: 'Bevægelsessensor',
      event: 'DeviceOffline',
      description: 'Device stopped responding.',
      timestamp: at(26 * hours),
    });
  }
}

interface MockResult {
  readonly status: number;
  readonly body?: unknown;
  readonly latencyMs?: number;
}

const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

/** The same table as the API's SensorValidationService. */
const SENSOR_RULES: Record<string, { min: number; max: number; unit: string }> = {
  temperature: { min: -40, max: 80, unit: '°C' },
  humidity: { min: 0, max: 100, unit: '%' },
  motion: { min: 0, max: 1, unit: 'bool' },
  light: { min: 0, max: 1, unit: 'bool' },
  power: { min: 0, max: 3680, unit: 'W' },
};

/** A timestamp the way the API sends it: UTC without a timezone. */
function naiveUtc(date: Date): string {
  return date.toISOString().slice(0, 19);
}

/** The same normalization on incoming parameters, so string comparison holds. */
function naiveParam(value: string): string {
  const parsed = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
  return naiveUtc(parsed);
}

function clamp(value: number, min: number, max: number): number {
  return Number.isNaN(value) ? min : Math.min(Math.max(value, min), max);
}

function ok(body: unknown): MockResult {
  return { status: 200, body };
}

function notFound(message: string): MockResult {
  return { status: 404, body: { statusCode: 404, message } };
}

function badRequest(message: string): MockResult {
  return { status: 400, body: { statusCode: 400, message } };
}

/** ASP.NET's model validation answers 400 with a problem-details document. */
function validationFailed(message: string): MockResult {
  return {
    status: 400,
    body: { statusCode: 400, message: 'One or more validation errors occurred.', detail: message },
  };
}

function unprocessable(detail: string): MockResult {
  return {
    status: 422,
    body: { statusCode: 422, message: 'Measurement rejected: outside permitted range.', detail },
  };
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Routes API_BASE_URL traffic into MockApiState. Remove it once the real API is up. */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);
  if (req.url !== baseUrl && !req.url.startsWith(`${baseUrl}/`)) {
    return next(req);
  }
  const state = inject(MockApiState);
  const result = state.handle(req, req.url.slice(baseUrl.length));
  const latency = result.latencyMs ?? state.randomLatency();
  if (result.status >= 400) {
    return timer(latency).pipe(
      mergeMap(() =>
        throwError(
          () =>
            new HttpErrorResponse({
              status: result.status,
              url: req.urlWithParams,
              error: result.body,
            }),
        ),
      ),
    );
  }
  return timer(latency).pipe(
    map(() => new HttpResponse({ status: result.status, body: result.body ?? null })),
  );
};
