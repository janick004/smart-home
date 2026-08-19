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
export interface DiscoveredDevice {
  /** The identity: POST /devices registers on the MAC address. */
  readonly mac: string;
  /** Prefilled name when the device announced one, otherwise empty. */
  readonly suggestedName: string;
  /** null when the network cannot tell what it is — then the user picks a type. */
  readonly kind: DeviceKind | null;
  readonly ip: string | null;
  readonly lastSeen: Date | null;
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
