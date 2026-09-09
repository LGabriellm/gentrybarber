import { describe, expect, it } from 'vitest';
import { addCalendarDays, assertWeeklyWindows, availableSlots, calendarDay, canTransition, isCalendarDate, localDate, localDateTimeToInstant, type CalendarDay } from './index';
import type { WeeklyWindow } from '@platform/types';

function slots(day: CalendarDay, startMinute: number, endMinute: number, durationMinutes = 30) {
  const windows = [{ weekday: day.weekday, startMinute, endMinute }];
  return availableSlots({ day, businessHours: windows, professionalHours: windows, durationMinutes, blocked: [], now: 0 });
}

describe('real instants and local calendars', () => {
  it('rejects invalid calendar dates and advances leap days without browser timezone', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(localDate(new Date('2026-09-10T02:30:00Z'), 'America/Sao_Paulo')).toBe('2026-09-09');
  });

  it('converts São Paulo local inputs and the exclusive midnight end explicitly', () => {
    expect(localDateTimeToInstant('2026-09-10', 9 * 60, 'America/Sao_Paulo')).toBe('2026-09-10T12:00:00.000Z');
    expect(localDateTimeToInstant('2026-09-10', 1_440, 'America/Sao_Paulo')).toBe('2026-09-11T03:00:00.000Z');
    expect(() => localDateTimeToInstant('2026-09-10', 1.5, 'America/Sao_Paulo')).toThrow();
  });

  it('does not create a nonexistent hour during the spring DST jump', () => {
    const day = calendarDay('2026-03-08', 'America/New_York');
    expect(day.minutes).toHaveLength(1_380);
    expect(() => localDateTimeToInstant(day.date, 150, day.timezone)).toThrow();
    const result = slots(day, 60, 240, 60);
    expect(result).toContainEqual({ startsAt: '2026-03-08T06:00:00.000Z', endsAt: '2026-03-08T07:00:00.000Z' });
    expect(result).toContainEqual({ startsAt: '2026-03-08T07:00:00.000Z', endsAt: '2026-03-08T08:00:00.000Z' });
    expect(result.every(item => new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime() === 60 * 60_000)).toBe(true);
  });

  it('keeps both repeated instants available, but rejects an ambiguous local input', () => {
    const day = calendarDay('2026-11-01', 'America/New_York');
    expect(day.minutes).toHaveLength(1_500);
    expect(() => localDateTimeToInstant(day.date, 90, day.timezone)).toThrow();
    const result = slots(day, 60, 120, 60);
    expect(result).toContainEqual({ startsAt: '2026-11-01T05:00:00.000Z', endsAt: '2026-11-01T06:00:00.000Z' });
    expect(result).toContainEqual({ startsAt: '2026-11-01T06:00:00.000Z', endsAt: '2026-11-01T07:00:00.000Z' });
    expect(new Set(result.map(item => item.startsAt)).size).toBe(result.length);
  });

  it('handles a midnight DST gap in São Paulo and a half-hour jump in Lord Howe', () => {
    expect(() => localDateTimeToInstant('2018-11-04', 0, 'America/Sao_Paulo')).toThrow();
    const day = calendarDay('2026-10-04', 'Australia/Lord_Howe');
    expect(day.minutes).toHaveLength(1_410);
    expect(() => localDateTimeToInstant(day.date, 135, day.timezone)).toThrow();
    expect(localDateTimeToInstant('2026-09-10', 540, 'Asia/Kathmandu')).toBe('2026-09-10T03:15:00.000Z');
  });
});

describe('weekly availability and blocked intervals', () => {
  it('intersects both weekly schedules and preserves adjacent reservations', () => {
    const day = calendarDay('2026-09-10', 'America/Sao_Paulo');
    const businessHours = [{ weekday: day.weekday, startMinute: 540, endMinute: 720 }];
    const professionalHours = [{ weekday: day.weekday, startMinute: 600, endMinute: 660 }];
    const result = availableSlots({ day, businessHours, professionalHours, durationMinutes: 15,
      blocked: [{ startsAt: Date.parse('2026-09-10T13:00:00Z'), endsAt: Date.parse('2026-09-10T13:30:00Z') }], now: 0,
    });
    expect(result).toEqual([
      { startsAt: '2026-09-10T13:30:00.000Z', endsAt: '2026-09-10T13:45:00.000Z' },
      { startsAt: '2026-09-10T13:45:00.000Z', endsAt: '2026-09-10T14:00:00.000Z' },
    ]);
  });

  it('does not bridge a lunch break and removes elapsed starts from the local grid', () => {
    const day = calendarDay('2026-09-10', 'America/Sao_Paulo');
    const windows = [{ weekday: day.weekday, startMinute: 540, endMinute: 600 }, { weekday: day.weekday, startMinute: 660, endMinute: 720 }];
    const result = availableSlots({ day, businessHours: windows, professionalHours: windows, durationMinutes: 45, blocked: [], now: Date.parse('2026-09-10T12:00:00.001Z') });
    expect(result.map(item => item.startsAt)).toEqual(['2026-09-10T12:15:00.000Z', '2026-09-10T14:00:00.000Z', '2026-09-10T14:15:00.000Z']);
  });

  it('treats a block in the first repeated hour independently of the second', () => {
    const day = calendarDay('2026-11-01', 'America/New_York');
    const windows = [{ weekday: 0, startMinute: 60, endMinute: 120 }];
    const result = availableSlots({ day, businessHours: windows, professionalHours: windows, durationMinutes: 60,
      blocked: [{ startsAt: Date.parse('2026-11-01T05:00:00Z'), endsAt: Date.parse('2026-11-01T06:00:00Z') }], now: 0,
    });
    expect(result).toEqual([{ startsAt: '2026-11-01T06:00:00.000Z', endsAt: '2026-11-01T07:00:00.000Z' }]);
  });

  it('rejects overlapping weekly ranges but accepts adjacency and independent weekdays', () => {
    const base: WeeklyWindow = { weekday: 1, startMinute: 540, endMinute: 600 };
    expect(() => assertWeeklyWindows([base, { ...base, startMinute: 599, endMinute: 660 }])).toThrow();
    expect(() => assertWeeklyWindows([base, { ...base, startMinute: 600, endMinute: 660 }, { ...base, weekday: 2 }])).not.toThrow();
    expect(() => assertWeeklyWindows([{ ...base, endMinute: base.startMinute }])).toThrow();
  });
});

describe('appointment lifecycle', () => {
  it('enforces ordered progression and terminal states', () => {
    expect(canTransition('CONFIRMED', 'IN_PROGRESS', 100, 200)).toBe(false);
    expect(canTransition('CONFIRMED', 'CHECKED_IN', 100, 200)).toBe(true);
    expect(canTransition('CHECKED_IN', 'IN_PROGRESS', 100, 200)).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED', 100, 200)).toBe(true);
    expect(canTransition('COMPLETED', 'CANCELED', 100, 200)).toBe(false);
    expect(canTransition('CANCELED', 'CONFIRMED', 100, 200)).toBe(false);
    expect(canTransition('NO_SHOW', 'CHECKED_IN', 100, 200)).toBe(false);
  });

  it('requires the start time for no-show and only permits canceling a legacy pending hold', () => {
    expect(canTransition('CONFIRMED', 'NO_SHOW', 100, 99)).toBe(false);
    expect(canTransition('CONFIRMED', 'NO_SHOW', 100, 100)).toBe(true);
    expect(canTransition('PENDING', 'CANCELED', 100, 99)).toBe(true);
    expect(canTransition('PENDING', 'CONFIRMED', 100, 99)).toBe(false);
  });
});
