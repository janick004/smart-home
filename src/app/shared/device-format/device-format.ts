import { Device, DeviceKind } from '../../core/models';
import { clockLabel, exactTimeLabel } from '../relative-time/relative-time';

/** Motion this recent counts as "Bevægelse lige nu". */
const MOTION_RECENT_MS = 2 * 60_000;

/** One shared wording for a lamp's state, including the optimistic in-flight phase. */
export function lampStateText(on: boolean, pendingOn: boolean | undefined): string {
  if (pendingOn !== undefined) {
    return pendingOn
      ? $localize`:lamp state while the turn-on command is in flight@@device.turningOn:Tændes…`
      : $localize`:lamp state while the turn-off command is in flight@@device.turningOff:Slukkes…`;
  }
  return on ? $localize`:lamp state@@device.on:Tændt` : $localize`:lamp state@@device.off:Slukket`;
}

/** One shared wording for motion sensors, so tiles and dialogs never contradict each other. */
export function motionHeadline(device: Extract<Device, { kind: 'motion' }>, now: Date): string {
  if (device.lastMotionAt === null) {
    return $localize`:motion sensor that has never reported motion@@device.noMotionYet:Ingen bevægelse endnu`;
  }
  return now.getTime() - device.lastMotionAt.getTime() < MOTION_RECENT_MS
    ? $localize`:motion sensor with very recent motion@@device.motionNow:Bevægelse lige nu`
    : $localize`:motion sensor at rest@@device.motionCalm:Ro lige nu`;
}

/** "Sidste bevægelse 14:18" — falls back to "i går 23:10" style for older motion. */
export function lastMotionLabel(lastMotionAt: Date, now: Date): string {
  const sameDay =
    lastMotionAt.getFullYear() === now.getFullYear() &&
    lastMotionAt.getMonth() === now.getMonth() &&
    lastMotionAt.getDate() === now.getDate();
  return sameDay ? clockLabel(lastMotionAt) : exactTimeLabel(lastMotionAt, now);
}

/** One-line status used on the Enheder grid tiles. */
export function deviceStatusText(
  device: Device,
  pendingOn: boolean | undefined,
  now: Date,
): string {
  if (!device.online) {
    return $localize`:device that does not respond@@device.notResponding:Svarer ikke`;
  }
  switch (device.kind) {
    case 'lamp':
      return lampStateText(device.on, pendingOn);
    case 'thermometer': {
      const parts: string[] = [];
      if (device.temperature !== null) {
        parts.push(`${device.temperature}°`);
      }
      if (device.humidity !== null) {
        parts.push(`${device.humidity} %`);
      }
      return parts.length > 0 ? parts.join(' · ') : noReadingsText();
    }
    case 'motion':
      return device.lastMotionAt !== null
        ? $localize`:when the sensor last saw motion@@device.lastMotion:Sidste bevægelse ${lastMotionLabel(device.lastMotionAt, now)}:time:`
        : $localize`:motion sensor at rest@@device.motionCalm:Ro lige nu`;
    case 'humidity':
      return device.humidity !== null ? `${device.humidity} %` : noReadingsText();
  }
}

/** The kinds a device can be set up as, in the order the picker shows them. */
export const DEVICE_KINDS: readonly DeviceKind[] = ['lamp', 'thermometer', 'humidity', 'motion'];

/** Human name for a device kind, for pickers and hints. */
export function deviceKindLabel(kind: DeviceKind): string {
  switch (kind) {
    case 'lamp':
      return $localize`:device kind@@kind.lamp:Lampe`;
    case 'thermometer':
      return $localize`:device kind@@kind.thermometer:Termometer`;
    case 'humidity':
      return $localize`:device kind@@kind.humidity:Fugtsensor`;
    case 'motion':
      return $localize`:device kind@@kind.motion:Bevægelsessensor`;
  }
}

/** "1 enhed" / "N enheder" — used in room headers and room tiles. */
export function deviceCountLabel(count: number): string {
  return count === 1
    ? $localize`:room with one device@@room.deviceCountOne:1 enhed`
    : $localize`:room with several devices@@room.deviceCountMany:${count}:count: enheder`;
}

/** Accessible name for a lamp's toggle switch. */
export function lampToggleLabel(name: string): string {
  return $localize`:aria label for a lamp's on/off switch@@device.toggleLabel:Tænd eller sluk ${name}:name:`;
}

export function noReadingsText(): string {
  return $localize`:sensor that has not reported any values yet@@device.noReadings:Ingen målinger endnu`;
}
