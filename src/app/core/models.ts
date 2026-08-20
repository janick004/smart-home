export interface Room {
  readonly id: string;
  readonly name: string;
}

interface DeviceBase {
  readonly id: string;
  readonly roomId: string;
  readonly name: string;
  readonly online: boolean;
  /**
   * When the device last showed a sign of life, for "opdateret … siden".
   * `null` = we have never heard from it; registration does NOT count as a sign
   * of life.
   */
  readonly updatedAt: Date | null;
  /**
   * WHAT the sign of life was. `'data'` = a reading or a command (so something
   * new actually arrived), `'seen'` = only a heartbeat/lastSeen (the device is
   * alive but has not sent data). Without that distinction a brand new sensor
   * would read as "opdateret lige nu", as if a measurement had arrived.
   */
  readonly updatedFrom: 'data' | 'seen' | null;
  /**
   * The technical fields exist only in the API's detail endpoint
   * (`GET /devices/{id}`), not in the list — they are null until the device
   * detail has been fetched.
   */
  readonly mac: string | null;
  readonly ip: string | null;
  readonly registeredAt: Date | null;
}

export interface LampDevice extends DeviceBase {
  readonly kind: 'lamp';
  readonly on: boolean;
}

export interface ThermometerDevice extends DeviceBase {
  readonly kind: 'thermometer';
  /** null until the device has reported its first reading. */
  readonly temperature: number | null;
  /** Some thermometers also measure humidity; null when they do not (or have not yet). */
  readonly humidity: number | null;
}

export interface MotionSensorDevice extends DeviceBase {
  readonly kind: 'motion';
  readonly lastMotionAt: Date | null;
}

export interface HumiditySensorDevice extends DeviceBase {
  readonly kind: 'humidity';
  readonly humidity: number | null;
}

export type Device = LampDevice | ThermometerDevice | MotionSensorDevice | HumiditySensorDevice;

export type DeviceKind = Device['kind'];

/** A device found on the wifi that is not registered in the home yet. */
/**
 * A device seen broadcasting its own wifi network, as the hub's scan reports it.
 * Everything we know is in the name and the signal: it is not on the home
 * network, so there is no IP, no type and no history yet.
 */
export interface DiscoveredDevice {
  /** The network name it is broadcasting, e.g. `SmartHome-5A7C`. */
  readonly ssid: string;
  /** BSSID of that access point. */
  readonly mac: string;
  /** dBm; closer to 0 is stronger. */
  readonly signalStrength: number;
}

export interface HistoryPoint {
  readonly at: Date;
  readonly value: number;
}

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly variant: 'neutral' | 'alert';
  readonly ttlMs: number;
  readonly action?: ToastAction;
}
