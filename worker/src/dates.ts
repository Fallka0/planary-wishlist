// Calendar dates as Date objects at UTC midnight, so subtracting two gives whole days.
// Same rules as src/lib/format.ts in the app.

const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

/** Today's date in Zurich, where every countdown is counted. Tests replace it with setToday. */
let todayOverride: Date | null = null;
export function setToday(d: Date | null) {
  todayOverride = d;
}

export function todayInZurich(now = new Date()): Date {
  if (todayOverride) return todayOverride;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return utc(get('year'), get('month'), get('day'));
}

export const isLeap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

/** Days in a month; year 0 means "any year", so February has 29. */
export function daysIn(month: number, year = 0): number {
  if (month === 2) return year === 0 || isLeap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * The next date on or after `from` for an occasion. Yearly dates (year null) roll over, and Feb 29
 * falls on Feb 28 in other years. A one-off date in the past has none (null).
 */
export function nextOccurrence(o: { month: number; day: number; year: number | null }, from: Date): Date | null {
  if (o.year !== null) {
    const d = utc(o.year, o.month, o.day);
    return d >= from ? d : null;
  }
  for (let y = from.getUTCFullYear(); y <= from.getUTCFullYear() + 1; y++) {
    const day = o.month === 2 && o.day === 29 && !isLeap(y) ? 28 : o.day;
    const d = utc(y, o.month, day);
    if (d >= from) return d;
  }
  return null;
}

export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);
