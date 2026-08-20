import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DashboardSummaryDto,
  DeviceCommandAcceptedDto,
  DeviceCommandDto,
  DeviceCreateDto,
  DeviceDetailDto,
  DeviceDto,
  DeviceHistoryQuery,
  DeviceQuery,
  DiscoveredDeviceDto,
  DeviceUpdateDto,
  EventLogCreateDto,
  EventLogDto,
  EventLogQuery,
  RoomDetailDto,
  RoomDto,
  RoomWriteDto,
  SensorDataCreateDto,
  SensorDataDto,
  SensorDataQuery,
} from './api-types';
import { COMMAND_EVENT_TYPE, toApiTimestamp } from './mapping';

/**
 * Where the API lives. The default is a relative path so the dev server can
 * proxy it (see `proxy.conf.json`) and the app runs same-origin — no CORS
 * involved. Point it at e.g. `http://raspberrypi.local:5080/api/v1` to talk to
 * the backend directly.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api/v1',
});

/**
 * Typed client for the Smart Home IoT API — one method per endpoint, no domain
 * logic. The rest of the app talks only to this class (and goes through
 * `mapping.ts` from there), so an API change touches only those two files.
 */
@Injectable({ providedIn: 'root' })
export class SmartHomeApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  // ---- Rooms ----

  getRooms(): Promise<RoomDto[]> {
    return firstValueFrom(this.http.get<RoomDto[]>(`${this.baseUrl}/rooms`));
  }

  getRoom(id: string): Promise<RoomDetailDto> {
    return firstValueFrom(this.http.get<RoomDetailDto>(`${this.baseUrl}/rooms/${id}`));
  }

  getRoomDevices(id: string): Promise<DeviceDto[]> {
    return firstValueFrom(this.http.get<DeviceDto[]>(`${this.baseUrl}/rooms/${id}/devices`));
  }

  createRoom(body: RoomWriteDto): Promise<RoomDto> {
    return firstValueFrom(this.http.post<RoomDto>(`${this.baseUrl}/rooms`, body));
  }

  updateRoom(id: string, body: RoomWriteDto): Promise<RoomDto> {
    return firstValueFrom(this.http.put<RoomDto>(`${this.baseUrl}/rooms/${id}`, body));
  }

  /** 409 while the room still has devices — move or delete them first. */
  deleteRoom(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/rooms/${id}`));
  }

  // ---- Devices ----

  /** The list shape: no IP and no registration date — fetch the detail for those. */
  getDevices(query: DeviceQuery = {}): Promise<DeviceDto[]> {
    let params = new HttpParams();
    if (query.roomId !== undefined) {
      params = params.set('roomId', query.roomId);
    }
    if (query.status !== undefined) {
      params = params.set('status', query.status);
    }
    return firstValueFrom(this.http.get<DeviceDto[]>(`${this.baseUrl}/devices`, { params }));
  }

  /**
   * Devices seen on the network but not registered yet. NOT IMPLEMENTED IN THE
   * API YET: expect a 404 until it is, which callers must handle.
   */
  getDiscoveredDevices(): Promise<DiscoveredDeviceDto[]> {
    return firstValueFrom(
      this.http.get<DiscoveredDeviceDto[]>(`${this.baseUrl}/devices/discovered`),
    );
  }

  getDevice(id: string): Promise<DeviceDetailDto> {
    return firstValueFrom(this.http.get<DeviceDetailDto>(`${this.baseUrl}/devices/${id}`));
  }

  /** The MAC address is required and must be unique (409 on a duplicate). */
  registerDevice(body: DeviceCreateDto): Promise<DeviceDetailDto> {
    return firstValueFrom(this.http.post<DeviceDetailDto>(`${this.baseUrl}/devices`, body));
  }

  /** Full replacement: always send name, type and room — not just the changed field. */
  updateDevice(id: string, body: DeviceUpdateDto): Promise<DeviceDetailDto> {
    return firstValueFrom(this.http.put<DeviceDetailDto>(`${this.baseUrl}/devices/${id}`, body));
  }

  /** The reading history cascades along; events are kept with deviceId = null. */
  deleteDevice(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/devices/${id}`));
  }

  /** A flat list of readings in the range — not series per sensor type. */
  getDeviceHistory(id: string, query: DeviceHistoryQuery): Promise<SensorDataDto[]> {
    let params = new HttpParams().set('range', query.range);
    if (query.sensorType !== undefined) {
      params = params.set('sensorType', query.sensorType);
    }
    return firstValueFrom(
      this.http.get<SensorDataDto[]>(`${this.baseUrl}/devices/${id}/history`, { params }),
    );
  }

  getDeviceEvents(id: string): Promise<EventLogDto[]> {
    return firstValueFrom(this.http.get<EventLogDto[]>(`${this.baseUrl}/devices/${id}/events`));
  }

  /** 202 Accepted — the command is written to the event log, not acknowledged by the device. */
  sendDeviceCommand(id: string, body: DeviceCommandDto): Promise<DeviceCommandAcceptedDto> {
    return firstValueFrom(
      this.http.post<DeviceCommandAcceptedDto>(`${this.baseUrl}/devices/${id}/command`, body),
    );
  }

  // ---- SensorData ----

  querySensorData(query: SensorDataQuery = {}): Promise<SensorDataDto[]> {
    let params = new HttpParams();
    if (query.deviceId !== undefined) {
      params = params.set('deviceId', query.deviceId);
    }
    if (query.sensorType !== undefined) {
      params = params.set('sensorType', query.sensorType);
    }
    if (query.from !== undefined) {
      params = params.set('from', toApiTimestamp(query.from));
    }
    if (query.to !== undefined) {
      params = params.set('to', toApiTimestamp(query.to));
    }
    if (query.take !== undefined) {
      params = params.set('take', query.take);
    }
    return firstValueFrom(this.http.get<SensorDataDto[]>(`${this.baseUrl}/sensordata`, { params }));
  }

  /**
   * The newest reading per device per sensor type — "what the house reads right now".
   *
   * Prefer this over `querySensorData` for anything that shows a current value.
   * The list endpoint answers with the newest N rows inside a time window, so a
   * device that reports rarely drops out of it and reads as having no data —
   * and, because the window depends on the filter, the same device could show
   * one number on the home page and another in its own dialog. This endpoint has
   * neither a window nor a row cap: exactly one row per device per sensor type.
   */
  getLatestSensorData(deviceId?: string): Promise<SensorDataDto[]> {
    const params =
      deviceId === undefined ? new HttpParams() : new HttpParams().set('deviceId', deviceId);
    return firstValueFrom(
      this.http.get<SensorDataDto[]>(`${this.baseUrl}/sensordata/latest`, { params }),
    );
  }

  /** 422 + an event-log entry when the value or the unit is outside spec. */
  ingestSensorData(body: SensorDataCreateDto): Promise<SensorDataDto> {
    return firstValueFrom(this.http.post<SensorDataDto>(`${this.baseUrl}/sensordata`, body));
  }

  deleteSensorData(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/sensordata/${id}`));
  }

  // ---- EventLog ----

  queryEventLog(query: EventLogQuery = {}): Promise<EventLogDto[]> {
    let params = new HttpParams();
    if (query.deviceId !== undefined) {
      params = params.set('deviceId', query.deviceId);
    }
    if (query.eventType !== undefined) {
      params = params.set('eventType', query.eventType);
    }
    if (query.from !== undefined) {
      params = params.set('from', toApiTimestamp(query.from));
    }
    if (query.to !== undefined) {
      params = params.set('to', toApiTimestamp(query.to));
    }
    if (query.take !== undefined) {
      params = params.set('take', query.take);
    }
    return firstValueFrom(this.http.get<EventLogDto[]>(`${this.baseUrl}/eventlog`, { params }));
  }

  /**
   * The newest command event per device — the API's only signal for whether a
   * lamp is on. Windowless for the same reason as `getLatestSensorData`: a lamp
   * whose last command fell outside the window used to read as switched OFF.
   */
  getLatestCommands(deviceId?: string): Promise<EventLogDto[]> {
    let params = new HttpParams().set('eventType', COMMAND_EVENT_TYPE);
    if (deviceId !== undefined) {
      params = params.set('deviceId', deviceId);
    }
    return firstValueFrom(
      this.http.get<EventLogDto[]>(`${this.baseUrl}/eventlog/latest`, { params }),
    );
  }

  createEvent(body: EventLogCreateDto): Promise<EventLogDto> {
    return firstValueFrom(this.http.post<EventLogDto>(`${this.baseUrl}/eventlog`, body));
  }

  // ---- Dashboard ----

  getDashboardSummary(): Promise<DashboardSummaryDto> {
    return firstValueFrom(this.http.get<DashboardSummaryDto>(`${this.baseUrl}/dashboard/summary`));
  }
}
