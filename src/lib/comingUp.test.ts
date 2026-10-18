import { describe, expect, it } from 'vitest';
import { comingUp, possessive } from './comingUp';
import type { OverviewResponse, PersonSummary } from './types';

const today = new Date('2026-10-16T00:00:00Z');
const occ = (id: number, label: string, month: number, day: number, budgetCents: number | null = null) => ({ id, label, month, day, year: null, budgetCents });
const person = (p: Partial<PersonSummary> & { id: number; title: string }): PersonSummary => ({
  personFullName: '',
  ideaCount: 0,
  occasions: [],
  pickedCentsByOccasion: {},
  pickedCountByOccasion: {},
  coPlanners: [],
  role: 'owner',
  ...p,
});
const me = { id: 'u1', email: 'noa@example.ch', displayName: 'Noa Brunner', initials: 'NB' };

// The prototype's overview: Mom’s birthday, Matteo turns 30, Christmas for three people.
const overview: OverviewResponse = {
  me,
  lists: [
    { id: 1, title: 'Birthday', itemCount: 9, shared: true, occasion: occ(1, 'Birthday', 5, 24), previews: [] },
    { id: 4, title: 'Christmas', itemCount: 0, shared: false, occasion: occ(2, 'Christmas', 12, 25), previews: [] },
  ],
  people: [
    person({ id: 5, title: 'Mom', ideaCount: 6, occasions: [occ(10, 'Birthday', 11, 2, 15000), occ(11, 'Christmas', 12, 25, 10000)], pickedCentsByOccasion: { 10: 9600 }, pickedCountByOccasion: { 10: 2 } }),
    person({ id: 6, title: 'Lea', occasions: [occ(12, 'Christmas', 12, 25, 8000)], pickedCentsByOccasion: { 12: 2990 }, pickedCountByOccasion: { 12: 1 } }),
    person({ id: 7, title: 'Jonas', occasions: [occ(13, 'Christmas', 12, 25, 6000)] }),
    person({ id: 8, title: 'Grandpa Ruedi', occasions: [occ(14, 'Birthday', 1, 19, 5000)] }),
  ],
  shared: [
    {
      listId: 10,
      token: 'tok',
      title: 'Matteo turns 30',
      owner: { id: 'u2', name: 'Matteo Keller', initials: 'MK', isMe: false },
      itemCount: 6,
      takenCount: 3,
      mineCount: 1,
      occasion: occ(20, 'Matteo turns 30', 11, 14),
    },
  ],
};

describe('comingUp', () => {
  const cards = comingUp(overview, today);

  it('lists the next 10 weeks, soonest first, and leaves later dates out', () => {
    expect(cards.map((c) => [c.title, c.days])).toEqual([
      ['Mom’s birthday', 17],
      ['Matteo turns 30', 29],
      ['Christmas', 70],
      ['Christmas', 70],
    ]);
  });

  it('shows the budget on a person’s card', () => {
    expect(cards[0]).toMatchObject({ progress: 0.64, left: 'CHF 96.– of CHF 150.–', right: '2 ideas picked', to: '/app/people/5' });
  });

  it('shows taken and mine on a shared list', () => {
    expect(cards[1]).toMatchObject({ progress: 0.5, left: 'You’re getting 1 item', right: '3 of 6 taken', to: '/app/shared/tok' });
  });

  it('merges the same day across people and opens the first of them', () => {
    const merged = cards.find((c) => c.left === 'Mom, Lea, Jonas');
    expect(merged).toMatchObject({ title: 'Christmas', right: 'CHF 29.90 of CHF 240.–', to: '/app/people/5' });
  });

  it('never shows reservations on my own wishlist', () => {
    const mine = cards.find((c) => c.to === '/app/lists/4');
    expect(mine).toMatchObject({ progress: null, left: '0 items', right: 'Only you' });
  });

  it('writes possessives', () => {
    expect([possessive('Mom'), possessive('Jonas'), possessive('Grandpa Ruedi')]).toEqual(['Mom’s', 'Jonas’', 'Grandpa Ruedi’s']);
  });
});
