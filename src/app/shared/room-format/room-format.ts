import { Device, HumiditySensorDevice, LampDevice, ThermometerDevice } from '../../core/models';
import { noReadingsText } from '../device-format/device-format';

/**
 * What a single room shows as its headline. It lives here because BOTH the home
 * page and the Rooms page must say the same thing about the same room —
 * otherwise Home can say 22° while Rooms says "Svarer ikke", and the user has no
 * way of telling which one is right.
 */
export interface RoomReading {
  /** The reading in big numbers/words: "22°", "68 %", "Lys tændt", "Tomt rum" … */
  readonly reading: string;
  /** The room has a light on right now (and that lamp answers). */
  readonly warm: boolean;
  /** At least one device does not answer. */
  readonly alert: boolean;
  /** How many devices do not answer — 0 when everything is fine. */
  readonly offlineCount: number;
}

/** The newest measurement wins when a room has several sensors of the same kind. */
function newestFirst<T extends Device>(devices: readonly T[]): readonly T[] {
  return [...devices].sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

/**
 * The room's measurement, if there is one: temperature is preferred, otherwise
 * humidity. Devices that do not answer are ignored — their last value is not
 * "the room's temperature right now".
 */
export function roomMeasurement(devices: readonly Device[]): string | null {
  const online = devices.filter((device) => device.online);
  const thermometer = newestFirst(
    online.filter(
      (device): device is ThermometerDevice =>
        device.kind === 'thermometer' && device.temperature !== null,
    ),
  )[0];
  if (thermometer?.temperature != null) {
    return `${thermometer.temperature}°`;
  }
  const humidity = newestFirst(
    online.filter(
      (device): device is HumiditySensorDevice =>
        device.kind === 'humidity' && device.humidity !== null,
    ),
  )[0];
  return humidity?.humidity != null ? `${humidity.humidity} %` : null;
}

/**
 * The full state of a room tile. The order is deliberate:
 *
 * 1. If NONE of the room's devices answer, the room is effectively down.
 * 2. Otherwise show a real measurement if there is one — also when a single
 *    device is dead, so one missing sensor never hides the room's temperature.
 * 3. Otherwise the light, if the room has lamps.
 * 4. Otherwise: an empty room, or devices that have not measured anything yet.
 */
export function roomReading(devices: readonly Device[]): RoomReading {
  const offlineCount = devices.filter((device) => !device.online).length;
  const lamps = devices.filter((device): device is LampDevice => device.kind === 'lamp');
  const warm = lamps.some((lamp) => lamp.online && lamp.on);

  if (devices.length > 0 && offlineCount === devices.length) {
    return {
      reading: $localize`:device that does not respond@@device.notResponding:Svarer ikke`,
      warm: false,
      alert: true,
      offlineCount,
    };
  }

  const measurement = roomMeasurement(devices);
  if (measurement !== null) {
    return { reading: measurement, warm, alert: offlineCount > 0, offlineCount };
  }

  if (lamps.some((lamp) => lamp.online)) {
    return {
      reading: warm
        ? $localize`:room tile reading@@rooms.lightOn:Lys tændt`
        : $localize`:room tile reading@@rooms.lightOff:Lys slukket`,
      warm,
      alert: offlineCount > 0,
      offlineCount,
    };
  }

  return {
    reading:
      devices.length === 0
        ? $localize`:room tile reading for an empty room@@rooms.emptyRoom:Tomt rum`
        : noReadingsText(),
    warm: false,
    alert: offlineCount > 0,
    offlineCount,
  };
}

/** "1 svarer ikke" / "2 svarer ikke" — for the meta line on a room tile. */
export function offlineCountLabel(count: number): string {
  return count === 1
    ? $localize`:one device in the room is not responding@@rooms.offlineOne:1 svarer ikke`
    : $localize`:several devices in the room are not responding@@rooms.offlineMany:${count}:count: svarer ikke`;
}
