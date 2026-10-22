// Planary Wishlist v2 · API types, copied from docs/wishlist-v2/api/api-types.ts.
// The Worker (worker/src) imports these types for its responses.
// Ids are numbers (D1 row ids), user ids are Planary account UUID strings, money is integer cents.

export type UserId = string;
export type Priority = 1 | 2 | 3; // 1 must have · 2 would love · 3 nice to have
export type ListKind = 'wish' | 'person';

export interface ApiError {
  error: string;   // human-readable, safe to show
  code?: string;   // machine-readable, see API.md "Error codes"
}

export interface Profile {
  id: UserId;
  email: string;
  displayName: string; // falls back to the email's local part
  initials: string;    // 2 letters, computed server-side
}

export interface PersonRef {
  id: UserId;
  name: string;        // display name; "you" is decided by the client via isMe
  initials: string;
  isMe: boolean;
}

export interface Occasion {
  id: number;
  label: string;       // "Birthday", "Christmas"
  month: number;       // 1–12
  day: number;         // 1–31
  year: number | null; // null = repeats every year
  budgetCents: number | null;
}

export interface Money {
  priceCents: number;  // 0 = no price
  currency: string;    // ISO 4217, default "CHF"
}

// ── Items ────────────────────────────────────────────────────────────

/** Item on the owner's own wishlist. Deliberately has NO reservation fields. */
export interface WishItem extends Money {
  id: number;
  listId: number;
  name: string;
  url: string;
  imageUrl: string;
  store: string;       // "galaxus.ch", "" when added by hand
  note: string;
  priority: Priority;
  createdAt: string;   // ISO
}

/** Idea on a person list, as seen by the owner and co-planners. */
export interface Idea extends Money {
  id: number;
  listId: number;
  name: string;
  url: string;
  imageUrl: string;
  store: string;
  note: string;
  addedBy: PersonRef;
  reservedBy: PersonRef | null; // "Lea is getting this" / "You're getting this"
  pickedFor: number[];          // occasion ids this idea counts toward
  createdAt: string;
}

/** Item on a shared wishlist, as seen by a visitor. */
export interface PublicItem extends Money {
  id: number;
  name: string;
  url: string;
  imageUrl: string;
  store: string;
  note: string;
  priority: Priority;
  /** 'hidden' is only ever sent to the list owner (preview of their own link). */
  status: 'free' | 'taken' | 'mine' | 'hidden';
}

// ── Lists ────────────────────────────────────────────────────────────

export interface ShareState {
  enabled: boolean;
  url: string | null;  // "https://wishlist.planary.ch/w/<token>" when enabled
}

export interface WishListDetail {
  id: number;
  kind: 'wish';
  title: string;
  occasion: Occasion | null;   // at most one on a wishlist
  share: ShareState;
  org: OrgRef | null;          // set on an organisation's wishlist, which its whole team edits
  items: WishItem[];
}

/** A Planary organisation (planary-org) the user is on the team of. */
export interface OrgRef {
  id: string;
  name: string;
}

export interface Member {
  id: number;                  // list_members.id
  user: PersonRef | null;      // null while the invite is pending
  email: string;
  status: 'invited' | 'active';
}

export interface PersonListDetail {
  id: number;
  kind: 'person';
  title: string;               // "Mom"
  personFullName: string;      // "Andrea Brunner"
  personNotes: string[];       // one entry per line
  occasions: Occasion[];       // sorted by next occurrence
  role: 'owner' | 'member';
  owner: PersonRef;
  members: Member[];
  items: Idea[];
}

export type ListDetail = WishListDetail | PersonListDetail;

// ── Overview (sidebar + home) ────────────────────────────────────────

export interface WishListSummary {
  id: number;
  title: string;
  itemCount: number;
  shared: boolean;
  occasion: Occasion | null;
  previews: { imageUrl: string; store: string }[]; // first 4 items for the mosaic
}

export interface PersonSummary {
  id: number;
  title: string;
  personFullName: string;
  ideaCount: number;
  occasions: Occasion[];
  /** Sum of ideas picked for each occasion, keyed by occasion id. */
  pickedCentsByOccasion: Record<number, number>;
  pickedCountByOccasion: Record<number, number>;
  coPlanners: PersonRef[];     // active members + owner if the viewer is a member
  role: 'owner' | 'member';
}

export interface SharedSummary {
  listId: number;
  token: string;               // open with /app/shared/:token
  title: string;
  owner: PersonRef;
  itemCount: number;
  takenCount: number;          // includes mine
  mineCount: number;
  occasion: Occasion | null;
}

/** An organisation's wishlists. maxLists comes from its plan; null = unlimited. */
export interface OrgSummary extends OrgRef {
  maxLists: number | null;
  lists: WishListSummary[];
}

export interface OverviewResponse {
  me: Profile;
  lists: WishListSummary[];
  organisations: OrgSummary[];
  people: PersonSummary[];
  shared: SharedSummary[];
}

// ── Link preview ─────────────────────────────────────────────────────

export interface LinkPreview extends Money {
  url: string;                 // normalised
  store: string;
  title: string;
  imageUrl: string;
}

// ── Public page ──────────────────────────────────────────────────────

export interface PublicListResponse {
  list: {
    title: string;
    owner: PersonRef;
    occasion: Occasion | null;
    items: PublicItem[];
  };
  viewer: { signedIn: boolean; isOwner: boolean };
}

export interface ReserveResponse {
  item: PublicItem;            // status 'mine'
  undoToken: string | null;    // only for guests; store in localStorage under `wl-undo:<shareToken>`
}

// ── Invites ──────────────────────────────────────────────────────────

export interface InviteResponse {
  member: Member;
  inviteUrl: string;           // personal link, shown/copied when email delivery is off
  emailSent: boolean;
}

export interface InvitePreview {
  listTitle: string;
  invitedBy: PersonRef;
  alreadyMember: boolean;
}

// ── Search ───────────────────────────────────────────────────────────

export interface SearchResponse {
  lists: { id: number; kind: ListKind; title: string }[];
  items: { id: number; listId: number; listKind: ListKind; listTitle: string; name: string }[];
}
