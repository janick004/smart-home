import { Device } from '../../core/models';
import { deviceStatusText } from './device-format';

const NOW = new Date(2026, 7, 18, 15, 0, 0);

const BASE = {
  id: '1',
  roomId: '1',
  name: 'Test',
  online: true,
  updatedAt: NOW,
  updatedFrom: 'data',
  mac: 'AA:BB:CC:DD:EE:FF',
  ip: '192.168.1.2',
  registeredAt: new Date(2026, 0, 1, 12, 0),
} as const;

describe('deviceStatusText', () => {
  it('always says "Svarer ikke" for offline devices', () => {
    const device: Device = { ...BASE, kind: 'lamp', on: true, online: false };
    expect(deviceStatusText(device, undefined, NOW)).toBe('Svarer ikke');
  });

  it('shows the in-flight wording while a switch command is pending', () => {
    const device: Device = { ...BASE, kind: 'lamp', on: true };
    expect(deviceStatusText(device, true, NOW)).toBe('Tændes…');
    expect(deviceStatusText(device, false, NOW)).toBe('Slukkes…');
    expect(deviceStatusText(device, undefined, NOW)).toBe('Tændt');
  });

  it('joins temperature and humidity like the mockup', () => {
    const device: Device = { ...BASE, kind: 'thermometer', temperature: 21, humidity: 43 };
    expect(deviceStatusText(device, undefined, NOW)).toBe('21° · 43 %');
  });

  it('shows only temperature when the thermometer has no humidity', () => {
    const device: Device = { ...BASE, kind: 'thermometer', temperature: 23, humidity: null };
    expect(deviceStatusText(device, undefined, NOW)).toBe('23°');
  });

  it('says so when a sensor has not reported anything yet', () => {
    const device: Device = { ...BASE, kind: 'thermometer', temperature: null, humidity: null };
    expect(deviceStatusText(device, undefined, NOW)).toBe('Ingen målinger endnu');
  });

  it('shows last motion with a clock time from the same day', () => {
    const device: Device = {
      ...BASE,
      kind: 'motion',
      lastMotionAt: new Date(2026, 7, 18, 14, 18),
    };
    expect(deviceStatusText(device, undefined, NOW)).toBe('Sidste bevægelse 14:18');
  });

  it('reports calm when no motion has been seen', () => {
    const device: Device = { ...BASE, kind: 'motion', lastMotionAt: null };
    expect(deviceStatusText(device, undefined, NOW)).toBe('Ro lige nu');
  });
});
