import { daysBetween, nextOccurrence } from './format';
import type { Idea, Occasion } from './types';

export interface Upcoming {
  occ: Occasion;
  /** Next date on or after today; null for a one-off date that has passed. */
  date: Date | null;
  days: number | null;
}

/** Occasions in the order they come up next. Dates that have passed go last. */
export function upcoming(occasions: Occasion[], today: Date): Upcoming[] {
  return occasions
    .map((occ) => {
      const date = nextOccurrence(occ, today);
      return { occ, date, days: date ? daysBetween(today, date) : null };
    })
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || a.occ.id - b.occ.id);
}

/** The occasion that comes up next, if any is still ahead. */
export function nextOf(occasions: Occasion[], today: Date): (Upcoming & { date: Date; days: number }) | null {
  const first = upcoming(occasions, today)[0];
  return first && first.date ? (first as Upcoming & { date: Date; days: number }) : null;
}

export interface BudgetState {
  /** CHF of the picked ideas. Other currencies aren't converted, same as the overview. */
  spentCents: number;
  picked: number;
  /** Share of the budget, 0–1, capped at 1. Null without a budget. */
  share: number | null;
  /** Positive = left, negative = over. Null without a budget. */
  leftCents: number | null;
}

/** What the ideas picked for one occasion add up to against its budget. */
export function budgetOf(items: Idea[], occ: Occasion): BudgetState {
  const picked = items.filter((i) => i.pickedFor.includes(occ.id));
  const spentCents = picked.filter((i) => i.currency === 'CHF').reduce((sum, i) => sum + i.priceCents, 0);
  const budget = occ.budgetCents;
  return {
    spentCents,
    picked: picked.length,
    share: budget ? Math.min(1, spentCents / budget) : null,
    leftCents: budget ? budget - spentCents : null,
  };
}
