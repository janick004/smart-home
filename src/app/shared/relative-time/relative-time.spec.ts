import { clockLabel, exactTimeLabel, relativeTimeLabel } from './relative-time';

const NOW = new Date(2026, 7, 18, 15, 0, 0); // 18 Aug 2026 15:00

function secondsAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe('clockLabel', () => {
  it('uses colon and zero-pads like the mockup (14:18)', () => {
    expect(clockLabel(new Date(2026, 7, 18, 14, 18))).toBe('14:18');
    expect(clockLabel(new Date(2026, 7, 18, 9, 5))).toBe('09:05');
  });
});

describe('relativeTimeLabel', () => {
  it('says "lige nu" for fresh values', () => {
    expect(relativeTimeLabel(secondsAgo(30), NOW)).toBe('lige nu');
  });

  it('uses Danish singular and plural minutes', () => {
    expect(relativeTimeLabel(secondsAgo(60), NOW)).toBe('for 1 minut siden');
    expect(relativeTimeLabel(secondsAgo(2 * 60), NOW)).toBe('for 2 minutter siden');
  });

  it('switches to hours after an hour', () => {
    expect(relativeTimeLabel(secondsAgo(60 * 60), NOW)).toBe('for 1 time siden');
    expect(relativeTimeLabel(secondsAgo(3 * 60 * 60), NOW)).toBe('for 3 timer siden');
  });

  it('falls back to day wording after 24 hours', () => {
    expect(relativeTimeLabel(new Date(2026, 7, 17, 9, 12), NOW)).toBe('i går 09:12');
  });
});

describe('exactTimeLabel', () => {
  it('labels the same day as "i dag"', () => {
    expect(exactTimeLabel(new Date(2026, 7, 18, 14, 32), NOW)).toBe('i dag 14:32');
  });

  it('labels the previous day as "i går"', () => {
    expect(exactTimeLabel(new Date(2026, 7, 17, 23, 10), NOW)).toBe('i går 23:10');
  });

  it('uses a short date for anything older', () => {
    const label = exactTimeLabel(new Date(2026, 7, 3, 14, 32), NOW);
    expect(label).toContain('14:32');
    expect(label).not.toContain('i dag');
    expect(label).not.toContain('i går');
  });
});
