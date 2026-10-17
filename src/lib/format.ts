// Swiss formatting for money, dates and counts (docs/wishlist-v2/SCREENS.md, "Formatting rules").
// Date logic matches pkg/app/dates.go; both have the same test cases.

const THOUSANDS = '’'; // ’
const EN_DASH = '–'; // –

/** "96.–", "59.90", "1’146.65": the amount without a currency. */
export function formatAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS);
  const rest = abs % 100;
  return `${sign}${whole}.${rest === 0 ? EN_DASH : String(rest).padStart(2, '0')}`;
}

/** "CHF 349.–", "CHF 59.90", "CHF 1’146.65", "EUR 49.90"; 0 is "No price". */
export function formatMoney(cents: number, currency = 'CHF'): string {
  if (!cents) return 'No price';
  return `${currency} ${formatAmount(cents)}`;
}

/**
 * Reads what people type into a price field: "179", "179.00", "179,90", "1’146.65", "CHF 49.-".
 * Returns cents, 0 for an empty field, or null when it isn't a price.
 */
export function parsePrice(input: string): number | null {
  const s = input
    .trim()
    .replace(/^[A-Za-z]{3}\s*(?=\d)/, '')
    .replace(/[’'\s]/g, '')
    .replace(/[.,][-–—]$/, '');
  if (s === '') return 0;
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

// ── Dates ──
// Dates here are calendar days, kept as Date objects at UTC midnight so subtraction gives whole days.

export interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number;
}

function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** Today's date in Zurich, where every countdown is counted. */
export function todayInZurich(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return utc(get('year'), get('month'), get('day'));
}

export function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

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

/** Calendar days from `from` to `to`. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, 2 Nov"; the year is added unless it's this year or next. */
export function formatDate(date: Date, today: Date = todayInZurich()): string {
  const y = date.getUTCFullYear();
  const base = `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  const thisYear = today.getUTCFullYear();
  return y === thisYear || y === thisYear + 1 ? base : `${base} ${y}`;
}

/** "24 May": day and month only, for meta lines. */
export function formatDayMonth(o: { month: number; day: number }): string {
  return `${o.day} ${MONTHS[o.month - 1]}`;
}

/** Countdown in sentences: "today", "tomorrow", "in 17 days". */
export function countdown(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** Countdown for the sidebar: "today", "17 d". */
export function countdownShort(days: number): string {
  return days === 0 ? 'today' : `${days} d`;
}

/** "1 item", "9 items", "1 idea", "6 ideas". */
export function pluralise(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Two letters for avatars, same rule as the API: "Noa Brunner" → "NB", "noa.brunner" → "NB", "Lea" → "LE". */
export function initials(name: string): string {
  const words = name.split(/[\s._@-]+/u).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length >= 2 ? [...words[0]][0] + [...words[1]][0] : [...words[0]].slice(0, 2).join('');
  return letters.toUpperCase();
}
