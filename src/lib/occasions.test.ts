import { describe, expect, it } from 'vitest';
import { budgetOf, nextOf, upcoming } from './occasions';
import type { Idea, Occasion } from './types';

const today = new Date(Date.UTC(2026, 9, 16)); // Fri, 16 Oct 2026

const occ = (id: number, month: number, day: number, extra: Partial<Occasion> = {}): Occasion => ({
  id,
  label: `O${id}`,
  month,
  day,
  year: null,
  budgetCents: null,
  ...extra,
});

const idea = (id: number, priceCents: number, pickedFor: number[], currency = 'CHF'): Idea => ({
  id,
  listId: 1,
  name: `Idea ${id}`,
  url: '',
  imageUrl: '',
  store: '',
  note: '',
  priceCents,
  currency,
  addedBy: { id: 'u', name: 'Noa Brunner', initials: 'NB', isMe: true },
  reservedBy: null,
  pickedFor,
  createdAt: '2026-10-01T00:00:00Z',
});

describe('upcoming', () => {
  it('sorts by the next date, wrapping into next year, with past one-offs last', () => {
    const list = upcoming([occ(1, 1, 19), occ(2, 12, 25), occ(3, 3, 1, { year: 2026 }), occ(4, 11, 2)], today);
    expect(list.map((u) => u.occ.id)).toEqual([4, 2, 1, 3]);
    expect(list.map((u) => u.days)).toEqual([17, 70, 95, null]);
  });

  it('counts today as 0', () => {
    expect(upcoming([occ(1, 10, 16)], today)[0].days).toBe(0);
  });
});

describe('nextOf', () => {
  it('is null when nothing is ahead', () => {
    expect(nextOf([occ(1, 3, 1, { year: 2025 })], today)).toBeNull();
    expect(nextOf([], today)).toBeNull();
  });

  it('picks the soonest', () => {
    expect(nextOf([occ(1, 12, 25), occ(2, 11, 2)], today)?.occ.id).toBe(2);
  });
});

describe('budgetOf', () => {
  const birthday = occ(50, 11, 2, { budgetCents: 15000 });

  it('adds up the CHF ideas picked for the occasion (Mom: 59 + 37 of 150)', () => {
    const b = budgetOf([idea(1, 5900, [50]), idea(2, 3700, [50, 51]), idea(3, 8900, [51]), idea(4, 4900, [])], birthday);
    expect(b).toEqual({ spentCents: 9600, picked: 2, share: 0.64, leftCents: 5400 });
  });

  it('counts other currencies as picked but leaves them out of the sum', () => {
    const b = budgetOf([idea(1, 5900, [50]), idea(2, 2000, [50], 'EUR')], birthday);
    expect(b.spentCents).toBe(5900);
    expect(b.picked).toBe(2);
  });

  it('caps the bar and goes negative when over', () => {
    const b = budgetOf([idea(1, 16200, [50])], birthday);
    expect(b.share).toBe(1);
    expect(b.leftCents).toBe(-1200);
  });

  it('has no bar without a budget', () => {
    const b = budgetOf([idea(1, 5900, [50])], occ(50, 11, 2));
    expect(b.share).toBeNull();
    expect(b.leftCents).toBeNull();
  });
});
