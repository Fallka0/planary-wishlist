import { describe, expect, it } from 'vitest';
import {
  countdown,
  countdownShort,
  daysBetween,
  daysIn,
  formatAmount,
  formatDate,
  formatMoney,
  initials,
  nextOccurrence,
  parsePrice,
  pluralise,
  todayInZurich,
} from './format';

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe('formatMoney', () => {
  it.each([
    [34900, 'CHF', 'CHF 349.–'],
    [5990, 'CHF', 'CHF 59.90'],
    [114665, 'CHF', 'CHF 1’146.65'],
    [100000000, 'CHF', 'CHF 1’000’000.–'],
    [4990, 'EUR', 'EUR 49.90'],
    [5, 'CHF', 'CHF 0.05'],
    [0, 'CHF', 'No price'],
  ])('%i %s → %s', (cents, currency, want) => {
    expect(formatMoney(cents, currency)).toBe(want);
  });

  it('formats amounts without the currency', () => {
    expect(formatAmount(9600)).toBe('96.–');
    expect(formatAmount(114665)).toBe('1’146.65');
    expect(formatAmount(0)).toBe('0.–');
  });
});

describe('parsePrice', () => {
  it.each([
    ['179', 17900],
    ['179.00', 17900],
    ['179,90', 17990],
    ['179.9', 17990],
    ['1’146.65', 114665],
    ["1'146.65", 114665],
    ['CHF 49.–', 4900],
    ['49.-', 4900],
    ['', 0],
    ['  ', 0],
  ])('%s → %i', (input, want) => {
    expect(parsePrice(input)).toBe(want);
  });

  it.each(['abc', '1.234', '-5', '12,345.6.7', '1e3'])('rejects %s', (input) => {
    expect(parsePrice(input)).toBeNull();
  });
});

// Same cases as the Worker's date tests in worker/test/unit.test.ts.
describe('nextOccurrence', () => {
  it.each([
    ['later this year', 11, 2, null, '2026-10-16', '2026-11-02'],
    ['today counts', 10, 16, null, '2026-10-16', '2026-10-16'],
    ['already passed rolls over', 3, 14, null, '2026-10-16', '2027-03-14'],
    ['Feb 29 in a non-leap year is Feb 28', 2, 29, null, '2026-10-16', '2027-02-28'],
    ['Feb 29 in a leap year', 2, 29, null, '2027-10-16', '2028-02-29'],
    ['Dec 31 on Dec 31', 12, 31, null, '2026-12-31', '2026-12-31'],
    ['Jan 1 from Dec 31', 1, 1, null, '2026-12-31', '2027-01-01'],
    ['one-off in the future', 6, 20, 2027, '2026-10-16', '2027-06-20'],
    ['one-off in the past drops out', 6, 20, 2026, '2026-10-16', null],
  ] as const)('%s', (_, month, day, year, from, want) => {
    const got = nextOccurrence({ month, day, year }, d(from));
    expect(got?.toISOString().slice(0, 10) ?? null).toBe(want);
  });

  it('counts calendar days, also across the DST change', () => {
    expect(daysBetween(d('2026-10-16'), d('2026-11-02'))).toBe(17);
    expect(daysBetween(d('2026-10-24'), d('2026-10-26'))).toBe(2);
  });

  it('knows the length of months', () => {
    expect([daysIn(2), daysIn(2, 2027), daysIn(2, 2028), daysIn(2, 2100), daysIn(4), daysIn(12)]).toEqual([29, 28, 29, 28, 30, 31]);
  });
});

describe('todayInZurich', () => {
  it('uses the Zurich calendar day, not UTC', () => {
    // 23:30 UTC on 16 Oct is already 17 Oct in Zurich (UTC+2 in summer time).
    expect(todayInZurich(new Date('2026-10-16T23:30:00Z')).toISOString().slice(0, 10)).toBe('2026-10-17');
    expect(todayInZurich(new Date('2026-12-31T22:59:00Z')).toISOString().slice(0, 10)).toBe('2026-12-31');
  });
});

describe('formatDate', () => {
  it('shows weekday, day and month, and the year only when it is far off', () => {
    const today = d('2026-10-16');
    expect(formatDate(d('2026-11-02'), today)).toBe('Mon, 2 Nov');
    expect(formatDate(d('2027-01-19'), today)).toBe('Tue, 19 Jan');
    expect(formatDate(d('2028-06-20'), today)).toBe('Tue, 20 Jun 2028');
    expect(formatDate(d('2025-12-25'), today)).toBe('Thu, 25 Dec 2025');
  });
});

describe('counts and countdowns', () => {
  it('pluralises', () => {
    expect(pluralise(1, 'item')).toBe('1 item');
    expect(pluralise(9, 'item')).toBe('9 items');
    expect(pluralise(0, 'idea')).toBe('0 ideas');
  });

  it('counts down', () => {
    expect([countdown(0), countdown(1), countdown(17)]).toEqual(['today', 'tomorrow', 'in 17 days']);
    expect([countdownShort(0), countdownShort(17)]).toEqual(['today', '17 d']);
  });

  it('makes initials like the API', () => {
    expect(['Noa Brunner', 'noa.brunner', 'Lea', 'L', 'émile zola', 'Anna Maria Keller', ''].map(initials)).toEqual([
      'NB',
      'NB',
      'LE',
      'L',
      'ÉZ',
      'AM',
      '?',
    ]);
  });
});
