// Local-date (not UTC) helpers for simple YYYY-MM-DD date fields.
//
// Date's own ISO parsing/formatting round-trips through UTC, which can
// silently shift a date by one day depending on the device's timezone offset
// (e.g. `new Date('2026-08-04')` can land on Aug 3 west of UTC). These two
// functions instead read/write the LOCAL year/month/day directly.

export function formatDateYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 24-hour value (e.g. 9, 17) → "9:00 AM" / "5:00 PM". Used by the hour-chip
// picker (rental start time).
export function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${period}`;
}

// A Date's local time-of-day → "9:30 AM". Used by spinner-style time pickers
// (mode="time") where the user can land on any minute, not just the hour.
export function formatTimeOfDay(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Date's local time-of-day → "09:30" (24h, for storage) and back → "9:30 AM".
export function timeToHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatTimeHHMM(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
