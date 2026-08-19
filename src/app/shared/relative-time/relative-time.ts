/**
 * Human time wording. The Intl locale is fixed to Danish for now — when more
 * locales arrive, wire this to LOCALE_ID together with the translation files.
 */
const INTL_LOCALE = 'da-DK';

/** "14:18" — the mockup uses colon, so we format by hand instead of Intl's "14.18". */
export function clockLabel(value: Date): string {
  const hours = value.getHours().toString().padStart(2, '0');
  const minutes = value.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

const DATE_SHORT = new Intl.DateTimeFormat(INTL_LOCALE, { day: 'numeric', month: 'short' });

function daysBetween(value: Date, now: Date): number {
  const startOf = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(now) - startOf(value)) / 86_400_000);
}

/** The precise moment, for hover titles: "i dag 14:32", "i går 09:12", "3. aug. 14:32". */
export function exactTimeLabel(value: Date, now: Date): string {
  const days = daysBetween(value, now);
  if (days === 0) {
    return $localize`:a clock time earlier today@@time.todayAt:i dag ${clockLabel(value)}:time:`;
  }
  if (days === 1) {
    return $localize`:a clock time yesterday@@time.yesterdayAt:i går ${clockLabel(value)}:time:`;
  }
  return `${DATE_SHORT.format(value)} ${clockLabel(value)}`;
}

/** Human wording: "lige nu", "for 2 minutter siden", "for 3 timer siden", then dates. */
export function relativeTimeLabel(value: Date, now: Date): string {
  const seconds = Math.max(0, (now.getTime() - value.getTime()) / 1000);
  if (seconds < 45) {
    return $localize`:happened moments ago@@time.justNow:lige nu`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return minutes === 1
      ? $localize`:one minute ago@@time.minuteAgo:for 1 minut siden`
      : $localize`:multiple minutes ago@@time.minutesAgo:for ${minutes}:count: minutter siden`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1
      ? $localize`:one hour ago@@time.hourAgo:for 1 time siden`
      : $localize`:multiple hours ago@@time.hoursAgo:for ${hours}:count: timer siden`;
  }
  return exactTimeLabel(value, now);
}
