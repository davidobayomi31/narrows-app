// Shared helpers for marinas.hours (see supabase/marina_hours.sql). Shape:
// { mon: {open:"08:00", close:"18:00", closed:false}, tue: {...}, ..., sun: {...} }.
// A marina that hasn't set this yet has `hours: null` — every helper here
// treats that (or a missing weekday key) as "no constraint," never as
// "closed," so existing marinas don't suddenly get boaters blocked.

import { formatTimeHHMM } from './dateFormat';

export type DayHours = { open: string; close: string; closed: boolean };
export type MarinaHours = Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', DayHours>>;

const WEEKDAY_KEYS: (keyof MarinaHours)[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// date.getDay() is 0=Sunday..6=Saturday — matches WEEKDAY_KEYS' order.
export function getHoursForDate(hours: MarinaHours | null | undefined, date: Date): DayHours | null {
  if (!hours) return null;
  return hours[WEEKDAY_KEYS[date.getDay()]] ?? null;
}

// "08:00"/"18:00" -> "8:00 AM – 6:00 PM"
export function formatHoursRange(h: DayHours): string {
  return `${formatTimeHHMM(h.open)} – ${formatTimeHHMM(h.close)}`;
}

// "HH:MM" -> minutes since midnight, for range comparisons.
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isWithinHours(h: DayHours, minutesSinceMidnight: number): boolean {
  if (h.closed) return false;
  return minutesSinceMidnight >= hhmmToMinutes(h.open) && minutesSinceMidnight <= hhmmToMinutes(h.close);
}
