import { Device, DeviceKind, DiscoveredDevice, Room } from '../models';
import {
  DeviceDetailDto,
  DeviceDto,
  DeviceUpdateDto,
  DiscoveredDeviceDto,
  EventLogDto,
  RoomDto,
  SensorDataDto,
} from './api-types';

/**
 * Translation between the API's DTOs and the app's domain (`core/models.ts`).
 * Everything the API does differently from the domain — integer ids, timestamps
 * without a timezone, status as 'Online', on/off that has to be derived from
 * the event log — is handled HERE and nowhere else.
 */

/** The event type the API writes when a command is sent to a device. */
export const COMMAND_EVENT_TYPE = 'CommandIssued';

/**
 * Reads a timestamp from the API. The database stores naive UTC and ASP.NET
 * sends it without a timezone (`"2026-08-18T11:50:51"`), while POST responses
 * do include `Z`. `new Date()` would read the first form as LOCAL time — two
 * hours off during summer time — so we append UTC when no zone is present.
 */
export function parseApiDate(value: string): Date {
  return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`);
}

/**
 * Formats an instant for the `from`/`to` parameters: UTC without `Z`, because
 * the server compares against naive UTC values in the database. With `Z` a
 * server in another timezone would shift the boundary.
 */
export function toApiTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19);
}

/** The domain's ids are strings; the API's are integers. */
export function toApiId(id: string): number {
  return Number(id);
}

/**
 * The command pulled out of an event description. The API stores it as prose
 * (`Command 'ON' issued to device 'Loftlampe'.`), so the value we need is the
 * first single-quoted one. See docs/API-NOTES.md: a real state field on the
 * device would make this unnecessary.
 */
export function parseCommand(description: string | null): 'ON' | 'OFF' | null {
  const match = /'([^']*)'/.exec(description ?? '');
  const command = match?.[1]?.trim().toUpperCase();
  return command === 'ON' || command === 'OFF' ? command : null;
}

/**
 * Device types: the database's `Type` is free text, so we normalize and accept
 * the common aliases. Unknown types give `null` — callers leave them alone (the
 * app only has tiles for these four kinds).
 */
export function parseDeviceKind(type: string): DeviceKind | null {
  switch (type.trim().toLowerCase()) {
    case 'lamp':
    case 'light':
    case 'lampe':
      return 'lamp';
    case 'thermometer':
    case 'temperature':
    case 'temperature_sensor':
    case 'termometer':
      return 'thermometer';
    case 'motion':
    case 'motion_sensor':
    case 'pir':
      return 'motion';
    case 'humidity':
    case 'humidity_sensor':
      return 'humidity';
    default:
      return null;
  }
}

/** The type string the API expects when the app creates or updates a device. */
export function toApiDeviceType(kind: DeviceKind): string {
  return kind;
}

/** The newest reading per sensor type for one device. */
export interface DeviceReadings {
  readonly temperature?: SensorDataDto;
  readonly humidity?: SensorDataDto;
  readonly motion?: SensorDataDto;
}

export function mapRoom(dto: RoomDto): Room {
  return { id: String(dto.roomId), name: dto.name };
}

function isDetail(dto: DeviceDto | DeviceDetailDto): dto is DeviceDetailDto {
  return 'macAddress' in dto;
}

/**
 * Builds the domain device from what the API can tell us: the device row, its
 * newest readings and — for lamps — the latest command, because the API has no
 * state field (docs/API-NOTES.md).
 *
 * `previous` is the device the app already had: the list shape from
 * `GET /devices` carries neither MAC, IP nor registration date, so those are
 * kept from the detail instead of being blanked out on every reload.
 *
 * Returns `null` for a device type the app does not know.
 */
export function mapDevice(
  dto: DeviceDto | DeviceDetailDto,
  readings: DeviceReadings,
  lastCommand: EventLogDto | null,
  previous?: Device,
): Device | null {
  const kind = parseDeviceKind(dto.type);
  if (kind === null) {
    return null;
  }
  const detail = isDetail(dto) ? dto : null;
  const lastSeen = dto.lastSeen === null ? null : parseApiDate(dto.lastSeen);
  const registeredAt =
    detail !== null ? parseApiDate(detail.registrationDate) : (previous?.registeredAt ?? null);
  const base = {
    id: String(dto.deviceId),
    roomId: String(dto.roomId),
    name: dto.name,
    online: dto.status.toLowerCase() === 'online',
    mac: detail !== null ? detail.macAddress : (previous?.mac ?? null),
    ip: detail !== null ? detail.iPv4Address : (previous?.ip ?? null),
    registeredAt,
  };
  /**
   * The latest sign of life and where it came from. Readings and commands are
   * "data"; `lastSeen` alone only means the device is alive. Neither one → we
   * have never heard from it (the registration time does not count).
   */
  const signal = (
    ...candidates: readonly (Date | null | undefined)[]
  ): { updatedAt: Date | null; updatedFrom: 'data' | 'seen' | null } => {
    let latest: Date | null = null;
    for (const candidate of candidates) {
      if (candidate && (latest === null || candidate > latest)) {
        latest = candidate;
      }
    }
    // Data beats the heartbeat, even when the heartbeat is newer: the user wants
    // to know how old the READING (or command) is — not that the device is alive.
    if (latest !== null) {
      return { updatedAt: latest, updatedFrom: 'data' };
    }
    return lastSeen === null
      ? { updatedAt: null, updatedFrom: null }
      : { updatedAt: lastSeen, updatedFrom: 'seen' };
  };

  switch (kind) {
    case 'lamp': {
      const commandAt = lastCommand ? parseApiDate(lastCommand.timestamp) : null;
      return {
        ...base,
        kind: 'lamp',
        on: parseCommand(lastCommand?.description ?? null) === 'ON',
        ...signal(commandAt),
      };
    }
    case 'thermometer':
      return {
        ...base,
        kind: 'thermometer',
        temperature: roundReading(readings.temperature),
        humidity: roundReading(readings.humidity),
        ...signal(timestampOf(readings.temperature), timestampOf(readings.humidity)),
      };
    case 'humidity':
      return {
        ...base,
        kind: 'humidity',
        humidity: roundReading(readings.humidity),
        ...signal(timestampOf(readings.humidity)),
      };
    case 'motion':
      return {
        ...base,
        kind: 'motion',
        lastMotionAt:
          readings.motion && readings.motion.value > 0
            ? parseApiDate(readings.motion.timestamp)
            : null,
        ...signal(timestampOf(readings.motion)),
      };
  }
}

/**
 * A device the hub has seen but nobody has registered. The MAC is the only
 * field we insist on: without it there is nothing to register. An unknown or
 * missing type becomes `null`, and the user picks one when setting the device up.
 */
export function mapDiscoveredDevice(dto: DiscoveredDeviceDto): DiscoveredDevice {
  return {
    mac: dto.macAddress,
    suggestedName: dto.suggestedName?.trim() ?? '',
    kind: dto.type ? parseDeviceKind(dto.type) : null,
    ip: dto.iPv4Address ?? null,
    lastSeen: dto.lastSeen ? parseApiDate(dto.lastSeen) : null,
  };
}

/**
 * The body for `PUT /devices/{id}`. The API replaces the WHOLE row, so every
 * field must be sent — including the unchanged ones.
 */
export function toDeviceUpdateDto(device: Device): DeviceUpdateDto {
  return {
    name: device.name,
    type: toApiDeviceType(device.kind),
    roomId: toApiId(device.roomId),
    iPv4Address: device.ip,
  };
}

/** Groups a readings response into "newest reading per device per sensor type". */
export function groupLatestReadings(
  samples: readonly SensorDataDto[],
): Map<string, DeviceReadings> {
  const byDevice = new Map<string, { -readonly [K in keyof DeviceReadings]: DeviceReadings[K] }>();
  for (const sample of samples) {
    const sensorType = sample.sensorType.toLowerCase();
    if (sensorType !== 'temperature' && sensorType !== 'humidity' && sensorType !== 'motion') {
      continue; // 'light'/'power' have no tile in the app
    }
    const deviceId = String(sample.deviceId);
    const entry = byDevice.get(deviceId) ?? {};
    const current = entry[sensorType];
    if (!current || current.timestamp < sample.timestamp) {
      entry[sensorType] = sample;
      byDevice.set(deviceId, entry);
    }
  }
  return byDevice;
}

/** Newest command event per device; the latest one wins. */
export function groupLatestCommands(events: readonly EventLogDto[]): Map<string, EventLogDto> {
  const byDevice = new Map<string, EventLogDto>();
  for (const event of events) {
    if (event.deviceId === null || event.event !== COMMAND_EVENT_TYPE) {
      continue;
    }
    const deviceId = String(event.deviceId);
    const current = byDevice.get(deviceId);
    if (!current || current.timestamp < event.timestamp) {
      byDevice.set(deviceId, event);
    }
  }
  return byDevice;
}

function roundReading(sample: SensorDataDto | undefined): number | null {
  return sample === undefined ? null : Math.round(sample.value);
}

function timestampOf(sample: SensorDataDto | undefined): Date | null {
  return sample === undefined ? null : parseApiDate(sample.timestamp);
}
