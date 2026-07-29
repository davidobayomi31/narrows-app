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
