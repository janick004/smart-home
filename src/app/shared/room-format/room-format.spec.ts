import {
  Device,
  HumiditySensorDevice,
  LampDevice,
  MotionSensorDevice,
  ThermometerDevice,
} from '../../core/models';
import { offlineCountLabel, roomMeasurement, roomReading } from './room-format';

/**
 * The whole state space of a single room tile. Every test is a situation a user
 * can actually end up in, and the assertion is that the tile says something that
 * matches reality.
 */
const BASE = {
  roomId: '1',
  online: true,
  updatedAt: new Date('2026-08-19T08:00:00Z'),
  updatedFrom: 'data',
  mac: null,
  ip: null,
  registeredAt: null,
} as const;

function lamp(id: string, on: boolean, online = true): LampDevice {
  return { ...BASE, id, name: `Lampe ${id}`, kind: 'lamp', on, online };
}

function thermometer(
  id: string,
  temperature: number | null,
  humidity: number | null = null,
  online = true,
  updatedAt: Date = BASE.updatedAt,
): ThermometerDevice {
  return {
    ...BASE,
    id,
    name: `Termometer ${id}`,
    kind: 'thermometer',
    temperature,
    humidity,
    online,
    updatedAt,
  };
}

function humiditySensor(id: string, humidity: number | null, online = true): HumiditySensorDevice {
  return { ...BASE, id, name: `Fugt ${id}`, kind: 'humidity', humidity, online };
}

function motion(id: string, online = true): MotionSensorDevice {
  return { ...BASE, id, name: `Bevægelse ${id}`, kind: 'motion', lastMotionAt: null, online };
}

describe('roomReading', () => {
  it('an empty room says so', () => {
    expect(roomReading([])).toMatchObject({
      reading: 'Tomt rum',
      warm: false,
      alert: false,
      offlineCount: 0,
    });
  });

  it('shows the temperature when the room has a thermometer', () => {
    expect(roomReading([thermometer('1', 21)]).reading).toBe('21°');
  });

  it('falls back to humidity when there is no thermometer', () => {
    expect(roomReading([humiditySensor('1', 68)]).reading).toBe('68 %');
  });

  it('prefers temperature over humidity when the room has both', () => {
    expect(roomReading([humiditySensor('1', 68), thermometer('2', 21)]).reading).toBe('21°');
  });

  it('uses the newest thermometer when a room has several', () => {
    const older = thermometer('1', 19, null, true, new Date('2026-08-19T06:00:00Z'));
    const newer = thermometer('2', 23, null, true, new Date('2026-08-19T08:30:00Z'));
    expect(roomReading([older, newer]).reading).toBe('23°');
  });

  it('a room with only lamps says whether the light is on', () => {
    expect(roomReading([lamp('1', false)])).toMatchObject({ reading: 'Lys slukket', warm: false });
    expect(roomReading([lamp('1', true)])).toMatchObject({ reading: 'Lys tændt', warm: true });
  });

  it('a room with devices but no measurements yet says exactly that', () => {
    expect(roomReading([motion('1')]).reading).toBe('Ingen målinger endnu');
  });

  it('says "Svarer ikke" only when the whole room is silent', () => {
    expect(roomReading([thermometer('1', 21, null, false)])).toMatchObject({
      reading: 'Svarer ikke',
      alert: true,
      offlineCount: 1,
    });
  });

  it('keeps the reading when one device is dead but the room still measures', () => {
    const room = [thermometer('1', 22), motion('2', false), lamp('3', true)];
    expect(roomReading(room)).toMatchObject({
      reading: '22°',
      warm: true,
      alert: true,
      offlineCount: 1,
    });
  });

  it('ignores the reading of a device that does not answer', () => {
    const room: Device[] = [thermometer('1', 21, null, false), humiditySensor('2', 55)];
    // The thermometer does not answer, so its 21° is not the room's temperature now.
    expect(roomReading(room).reading).toBe('55 %');
  });

  it('does not call a room warm because a dead lamp was last told to turn on', () => {
    expect(roomReading([lamp('1', true, false), thermometer('2', 20)])).toMatchObject({
      reading: '20°',
      warm: false,
      alert: true,
    });
  });

  it('a room where only the lamp answers still reports the light', () => {
    expect(roomReading([lamp('1', true), motion('2', false)])).toMatchObject({
      reading: 'Lys tændt',
      warm: true,
      alert: true,
      offlineCount: 1,
    });
  });
});

describe('roomMeasurement', () => {
  it('is null when nothing in the room measures anything', () => {
    expect(roomMeasurement([lamp('1', true), motion('2')])).toBeNull();
    expect(roomMeasurement([thermometer('1', null)])).toBeNull();
    expect(roomMeasurement([])).toBeNull();
  });

  it('is null when the only sensor is offline', () => {
    expect(roomMeasurement([thermometer('1', 21, null, false)])).toBeNull();
  });
});

describe('offlineCountLabel', () => {
  it('counts in Danish', () => {
    expect(offlineCountLabel(1)).toBe('1 svarer ikke');
    expect(offlineCountLabel(3)).toBe('3 svarer ikke');
  });
});
