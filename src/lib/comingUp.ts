// "Coming up" on the overview: every occasion in the next 10 weeks, from gift-idea lists, my own
// wishlists and lists shared with me, as one card each (SCREENS.md §1).

import { daysBetween, formatAmount, nextOccurrence, pluralise } from './format';

/** Budgets compare francs, so 0 reads "CHF 0.–" rather than "No price". */
const chf = (cents: number) => `CHF ${formatAmount(cents)}`;
import type { OverviewResponse } from './types';

export const COMING_UP_DAYS = 70;

export interface ComingUpCard {
  key: string;
  title: string;
  date: Date;
  days: number;
  /** 0–1, or null for no bar. */
  progress: number | null;
  left: string;
  right: string;
  to: string;
}

/** "Mom’s", "Jonas’". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** Birthdays read as "Mom’s birthday"; anything else keeps its own name ("Christmas"). */
const PERSONAL = /^(birthday|anniversary|name day|wedding anniversary)$/i;

export function comingUp(o: OverviewResponse, today: Date): ComingUpCard[] {
  const cards: ComingUpCard[] = [];
  const within = (occ: { month: number; day: number; year: number | null }) => {
    const date = nextOccurrence(occ, today);
    if (!date) return null;
    const days = daysBetween(today, date);
    return days <= COMING_UP_DAYS ? { date, days } : null;
  };

  // Gift ideas: one card per occasion. The same occasion on the same day across several people
  // (Christmas) becomes one card.
  const groups = new Map<string, { label: string; date: Date; days: number; entries: { person: OverviewResponse['people'][number]; occasionId: number; budget: number | null }[] }>();
  for (const p of o.people) {
    for (const occ of p.occasions) {
      const when = within(occ);
      if (!when) continue;
      const key = `${occ.label.toLowerCase()}|${when.date.toISOString()}`;
      const g = groups.get(key) ?? { label: occ.label, ...when, entries: [] };
      g.entries.push({ person: p, occasionId: occ.id, budget: occ.budgetCents });
      groups.set(key, g);
    }
  }
  for (const [key, g] of groups) {
    const picked = g.entries.reduce((sum, e) => sum + (e.person.pickedCentsByOccasion[e.occasionId] ?? 0), 0);
    const pickedCount = g.entries.reduce((sum, e) => sum + (e.person.pickedCountByOccasion[e.occasionId] ?? 0), 0);
    const budget = g.entries.reduce((sum, e) => sum + (e.budget ?? 0), 0);
    const first = g.entries[0].person;
    const to = `/app/people/${first.id}`;
    if (g.entries.length === 1) {
      const title = PERSONAL.test(g.label) ? `${possessive(first.title)} ${g.label.toLowerCase()}` : `${g.label} · ${first.title}`;
      cards.push(
        budget > 0
          ? {
              key,
              title,
              date: g.date,
              days: g.days,
              progress: picked / budget,
              left: `${chf(picked)} of ${chf(budget)}`,
              right: `${pluralise(pickedCount, 'idea')} picked`,
              to,
            }
          : { key, title, date: g.date, days: g.days, progress: null, left: pluralise(first.ideaCount, 'idea'), right: '', to },
      );
    } else {
      cards.push({
        key,
        title: g.label,
        date: g.date,
        days: g.days,
        progress: budget > 0 ? picked / budget : null,
        left: g.entries.map((e) => e.person.title).join(', '),
        right: budget > 0 ? `${chf(picked)} of ${chf(budget)}` : '',
        to,
      });
    }
  }

  // Lists shared with me: how many are taken, and how many by me.
  for (const s of o.shared) {
    const when = s.occasion && within(s.occasion);
    if (!when) continue;
    cards.push({
      key: `shared|${s.listId}`,
      title: s.title,
      ...when,
      progress: s.itemCount > 0 ? s.takenCount / s.itemCount : 0,
      left: s.mineCount > 0 ? `You’re getting ${pluralise(s.mineCount, 'item')}` : 'Nothing reserved by you',
      right: `${s.takenCount} of ${s.itemCount} taken`,
      to: `/app/shared/${s.token}`,
    });
  }

  // My own wishlists: no bar, they never say what's reserved.
  for (const l of o.lists) {
    const when = l.occasion && within(l.occasion);
    if (!when) continue;
    cards.push({
      key: `list|${l.id}`,
      title: l.title,
      ...when,
      progress: null,
      left: pluralise(l.itemCount, 'item'),
      right: l.shared ? 'Shared' : 'Only you',
      to: `/app/lists/${l.id}`,
    });
  }

  return cards.sort((a, b) => a.days - b.days || a.title.localeCompare(b.title));
}
