/**
 * DTOs for the REAL API (SmartHomeIoT.Api, ASP.NET Core 8) — one type per body
 * the API sends or receives, with the field names it actually uses. Verified
 * against a running instance, not guessed.
 *
 * Two things to remember about the shape:
 *
 * 1. **Ids are integers.** The domain (`core/models.ts`) uses strings, so the
 *    conversion happens in `mapping.ts` — not out in the components.
 * 2. **Timestamps carry no timezone.** The database stores naive UTC and
 *    ASP.NET serializes it without `Z` (`"2026-08-18T11:50:51"`), while POST
 *    responses do include `Z` (they come from `DateTime.UtcNow`). ALWAYS use
 *    `parseApiDate()` from `mapping.ts` — a plain `new Date(...)` reads the
 *    first form as local time and lands 2 hours off during summer time.
 */

/** Status as the API writes it (the C# enum `DeviceStatus.ToString()`). */
export type DeviceStatusDto = 'Online' | 'Offline';

/** The ranges `GET /devices/{id}/history` accepts. */
export type HistoryRangeDto = '24h' | '7d' | '30d';

/**
 * Sensor types the API validates against (`SensorValidationService`), each with
 * the unit it requires. Other values are rejected with 422.
 */
export type SensorTypeDto = 'temperature' | 'humidity' | 'motion' | 'light' | 'power';

// ---- Rooms ----

export interface RoomDto {
  readonly roomId: number;
  readonly name: string;
  readonly deviceCount: number;
}

export interface RoomDetailDto {
  readonly roomId: number;
  readonly name: string;
  readonly devices: readonly DeviceDto[];
}

/** Same body for POST and PUT — the API has a single `Name` field both ways. */
export interface RoomWriteDto {
  readonly name: string;
}

// ---- Devices ----

/**
 * The list shape (`GET /devices`, `GET /rooms/{id}/devices`). Note that neither
 * IP nor registration date is here — those live only in the detail.
 */
export interface DeviceDto {
  readonly deviceId: number;
  readonly name: string;
  /** Free text in the database; the app expects 'lamp' | 'thermometer' | 'motion' | 'humidity'. */
  readonly type: string;
  readonly roomId: number;
  readonly roomName: string | null;
  readonly status: DeviceStatusDto | string;
  readonly lastSeen: string | null;
}

/** The detail shape (`GET /devices/{id}`, and the response to POST/PUT /devices). */
export interface DeviceDetailDto extends DeviceDto {
  readonly macAddress: string;
  /** The field name is not a typo — ASP.NET camelCases `IPv4Address` like this. */
  readonly iPv4Address: string | null;
  readonly registrationDate: string;
}

/**
 * `GET /devices/discovered` — one access point the hub's radio can see, filtered
 * server-side to names starting with "SmartHome".
 *
 * This is a WIFI SCAN, not a database lookup: the hub shells out to
 * `iw dev wlan0 scan` (`Services/WifiDiscoveryService.cs`). A device therefore
 * only appears while it is broadcasting its own network, and nothing here is
 * stored. `signalStrength` is dBm — closer to 0 is stronger.
 */
export interface DiscoveredDeviceDto {
  readonly ssid: string;
  readonly macAddress: string;
  readonly signalStrength: number;
}

/** The MAC address is required and must be AA:BB:CC:DD:EE:FF (the API validates it). */
export interface DeviceCreateDto {
  readonly name: string;
  readonly type: string;
  readonly roomId: number;
  readonly macAddress: string;
  readonly iPv4Address?: string | null;
}

/** PUT is a FULL replacement: name, type and room MUST be sent (the MAC cannot be changed). */
export interface DeviceUpdateDto {
  readonly name: string;
  readonly type: string;
  readonly roomId: number;
  readonly iPv4Address?: string | null;
}

export interface DeviceQuery {
  readonly roomId?: string;
  /** Matched case-insensitively by the API. */
  readonly status?: 'online' | 'offline';
}

/** The API takes free text; 'ON'/'OFF' is what the app (and the MQTT topic) uses. */
export interface DeviceCommandDto {
  readonly command: 'ON' | 'OFF';
}

/**
 * A command answers 202 Accepted with a message — no acknowledgement from the
 * device. See docs/API-NOTES.md: the UI's rollback can only see HTTP errors.
 */
export interface DeviceCommandAcceptedDto {
  readonly message: string;
}

// ---- SensorData ----

export interface SensorDataDto {
  readonly dataId: number;
  readonly deviceId: number;
  readonly sensorType: string;
  readonly value: number;
  readonly unit: string;
  readonly timestamp: string;
}

/** `unit` is required and must match the sensor type (°C | % | bool | lux | W). */
export interface SensorDataCreateDto {
  readonly deviceId: number;
  readonly sensorType: SensorTypeDto;
  readonly value: number;
  readonly unit: string;
  readonly timestamp?: string;
}

export interface SensorDataQuery {
  readonly deviceId?: string;
  readonly sensorType?: SensorTypeDto;
  readonly from?: Date;
  readonly to?: Date;
  /** The API defaults to 200 and caps at 1000 — set it when fetching in bulk. */
  readonly take?: number;
}

export interface DeviceHistoryQuery {
  readonly range: HistoryRangeDto;
  readonly sensorType?: SensorTypeDto;
}

// ---- EventLog ----

export interface EventLogDto {
  readonly eventId: number;
  /** null once the device is deleted — the event itself is kept. */
  readonly deviceId: number | null;
  readonly deviceName: string | null;
  /** The event type, e.g. 'CommandIssued' | 'DeviceRegistered' | 'DeviceRemoved'. */
  readonly event: string;
  readonly description: string | null;
  readonly timestamp: string;
}

export interface EventLogCreateDto {
  readonly deviceId?: number | null;
  readonly event: string;
  readonly description?: string;
}

export interface EventLogQuery {
  readonly deviceId?: string;
  readonly eventType?: string;
  readonly from?: Date;
  readonly to?: Date;
  readonly take?: number;
}

// ---- Dashboard ----

export interface DashboardSummaryDto {
  readonly totalRooms: number;
  readonly totalDevices: number;
  readonly onlineDevices: number;
  readonly offlineDevices: number;
  readonly measurementsLast24Hours: number;
  readonly recentEvents: readonly EventLogDto[];
}
