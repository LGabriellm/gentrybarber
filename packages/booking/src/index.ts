import { AccessError, type AppointmentStatusView, type WeeklyWindow } from '@platform/types';

const minuteMs = 60_000;
const dayMs = 1_440 * minuteMs;
export interface TimeRange { startsAt: number; endsAt: number }
export interface CalendarDay extends TimeRange {
  date: string;
  timezone: string;
  weekday: number;
  minutes: { instant: number; localMinute: number }[];
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

export function addCalendarDays(date: string, days: number): string {
  if (!isCalendarDate(date) || !Number.isInteger(days)) throw new AccessError('INVALID_INPUT');
  return new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * dayMs).toISOString().slice(0, 10);
}

function formatter(timezone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { throw new AccessError('INVALID_INPUT'); }
}

function localParts(format: Intl.DateTimeFormat, instant: number) {
  const parts = Object.fromEntries(format.formatToParts(instant).map(part => [part.type, part.value]));
  return { date: `${parts.year?.padStart(4, '0')}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function localDate(instant: Date | number, timezone: string): string {
  const time = instant instanceof Date ? instant.getTime() : instant;
  if (!Number.isFinite(time)) throw new AccessError('INVALID_INPUT');
  return localParts(formatter(timezone), time).date;
}

/** Enumerate real UTC minutes: gaps disappear and repeated wall times remain distinct. */
export function calendarDay(date: string, timezone: string): CalendarDay {
  if (!isCalendarDate(date)) throw new AccessError('INVALID_INPUT');
  const reference = new Date(`${date}T00:00:00.000Z`);
  const format = formatter(timezone);
  const minutes: CalendarDay['minutes'] = [];
  for (let instant = reference.getTime() - dayMs; instant < reference.getTime() + 2 * dayMs; instant += minuteMs) {
    const wall = localParts(format, instant);
    if (wall.date === date) minutes.push({ instant, localMinute: wall.minute });
  }
  const first = minutes[0];
  const last = minutes.at(-1);
  if (!first || !last) throw new AccessError('INVALID_INPUT');
  return { date, timezone, weekday: reference.getUTCDay(), minutes, startsAt: first.instant, endsAt: last.instant + minuteMs };
}

export function localDateTimeToInstant(date: string, minute: number, timezone: string): string {
  if (!Number.isInteger(minute) || minute < 0 || minute > 1_440) throw new AccessError('INVALID_INPUT');
  const day = calendarDay(minute === 1_440 ? addCalendarDays(date, 1) : date, timezone);
  const matches = day.minutes.filter(item => item.localMinute === minute % 1_440);
  if (matches.length !== 1) throw new AccessError('INVALID_INPUT');
  return new Date(matches[0]!.instant).toISOString();
}

export function assertWeeklyWindows(windows: readonly WeeklyWindow[]): void {
  if (windows.length > 28) throw new AccessError('INVALID_INPUT');
  const sorted = [...windows].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (let index = 0; index < sorted.length; index++) {
    const item = sorted[index]!;
    const previous = sorted[index - 1];
    if (![item.weekday, item.startMinute, item.endMinute].every(Number.isInteger)
      || item.weekday < 0 || item.weekday > 6 || item.startMinute < 0 || item.endMinute > 1_440 || item.endMinute <= item.startMinute
      || (previous && previous.weekday === item.weekday && previous.endMinute > item.startMinute)) throw new AccessError('INVALID_INPUT');
  }
}

export function workingIntervals(day: CalendarDay, businessHours: readonly WeeklyWindow[], professionalHours: readonly WeeklyWindow[]): TimeRange[] {
  const business = businessHours.filter(window => window.weekday === day.weekday);
  const professional = professionalHours.filter(window => window.weekday === day.weekday);
  const intervals: TimeRange[] = [];
  for (const { instant, localMinute } of day.minutes) {
    const inside = (window: WeeklyWindow) => window.startMinute <= localMinute && localMinute < window.endMinute;
    if (!business.some(inside) || !professional.some(inside)) continue;
    const last = intervals.at(-1);
    if (last && last.endsAt === instant) last.endsAt = instant + minuteMs;
    else intervals.push({ startsAt: instant, endsAt: instant + minuteMs });
  }
  return intervals;
}

export function overlaps(left: TimeRange, right: TimeRange): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function intervalFits(interval: TimeRange, windows: readonly TimeRange[]): boolean {
  return interval.endsAt > interval.startsAt && windows.some(window => window.startsAt <= interval.startsAt && window.endsAt >= interval.endsAt);
}

export function availableSlots(input: {
  day: CalendarDay;
  businessHours: readonly WeeklyWindow[];
  professionalHours: readonly WeeklyWindow[];
  durationMinutes: number;
  blocked: readonly TimeRange[];
  now: number;
}): { startsAt: string; endsAt: string }[] {
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1_440) throw new AccessError('INVALID_INPUT');
  const windows = workingIntervals(input.day, input.businessHours, input.professionalHours);
  return input.day.minutes.filter(item => item.localMinute % 15 === 0 && item.instant >= input.now).flatMap(item => {
    const interval = { startsAt: item.instant, endsAt: item.instant + input.durationMinutes * minuteMs };
    if (!intervalFits(interval, windows) || input.blocked.some(block => overlaps(interval, block))) return [];
    return [{ startsAt: new Date(interval.startsAt).toISOString(), endsAt: new Date(interval.endsAt).toISOString() }];
  });
}

export const occupyingStatuses = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED'] as const;
const transitions: Record<AppointmentStatusView, readonly AppointmentStatusView[]> = {
  PENDING: ['CANCELED'], CONFIRMED: ['CHECKED_IN', 'CANCELED', 'NO_SHOW'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELED', 'NO_SHOW'], IN_PROGRESS: ['COMPLETED', 'CANCELED'],
  COMPLETED: [], CANCELED: [], NO_SHOW: [],
};
export function canTransition(from: AppointmentStatusView, to: AppointmentStatusView, startsAt: number, now: number): boolean {
  return transitions[from].includes(to) && (to !== 'NO_SHOW' || now >= startsAt);
}
