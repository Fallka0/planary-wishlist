// Typed client for the Wishlist API (docs/wishlist-v2/api/API.md).

import { getAccessToken, getSession, redirectToSignIn, refreshSession } from './session';
import type {
  ApiError as ApiErrorBody,
  Idea,
  InvitePreview,
  InviteResponse,
  LinkPreview,
  ListDetail,
  ListKind,
  Occasion,
  OverviewResponse,
  Priority,
  Profile,
  PublicItem,
  PublicListResponse,
  ReserveResponse,
  SearchResponse,
  ShareState,
  WishItem,
} from './types';

const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '';

/** An error response from the API, with the message written for the UI. */
export class ApiError extends Error {
  status: number;
  code: string;
  store?: string;

  constructor(status: number, body: Partial<ApiErrorBody> & { store?: string }) {
    super(body.error || 'Something went wrong. Try again in a moment.');
    this.status = status;
    this.code = body.code ?? '';
    this.store = body.store;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  /** Public pages work signed out: don't send anyone to sign in on a 401. */
  optionalAuth?: boolean;
}

async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await send(path, opts, await getAccessToken());
  if (res.status === 401 && getSession()) {
    // The token may have been revoked early: renew once, then give up.
    const renewed = await refreshSession();
    res = await send(path, opts, renewed?.accessToken ?? null);
  }
  if (res.status === 401 && !opts.optionalAuth) {
    redirectToSignIn();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const q = (params: Record<string, string | number>) => `?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`;

export interface ItemInput {
  name?: string;
  url?: string;
  imageUrl?: string;
  store?: string;
  note?: string;
  priceCents?: number;
  currency?: string;
  priority?: Priority;
}

export interface OccasionInput {
  label?: string;
  month?: number;
  day?: number;
  year?: number | null;
  budgetCents?: number | null;
}

export const api = {
  me: () => request<{ me: Profile }>('/api/me').then((r) => r.me),
  overview: () => request<OverviewResponse>('/api/overview'),
  search: (query: string, signal?: AbortSignal) => request<SearchResponse>(`/api/search${q({ q: query })}`, { signal }),

  /** With orgId, a wishlist of that organisation. */
  createList: (kind: ListKind, title: string, orgId?: string) =>
    request<{ list: ListDetail }>('/api/lists', { method: 'POST', body: orgId ? { kind, title, orgId } : { kind, title } }).then((r) => r.list),
  list: (id: number) => request<{ list: ListDetail }>(`/api/lists${q({ id })}`).then((r) => r.list),
  updateList: (id: number, patch: { title?: string; personFullName?: string; personNotes?: string[] }) =>
    request<{ list: ListDetail }>(`/api/lists${q({ id })}`, { method: 'PATCH', body: patch }).then((r) => r.list),
  deleteList: (id: number) => request<void>(`/api/lists${q({ id })}`, { method: 'DELETE' }),

  createItem: (listId: number, input: ItemInput) =>
    request<{ item: WishItem | Idea }>('/api/items', { method: 'POST', body: { listId, ...input } }).then((r) => r.item),
  updateItem: (id: number, input: ItemInput) =>
    request<{ item: WishItem | Idea }>(`/api/items${q({ id })}`, { method: 'PATCH', body: input }).then((r) => r.item),
  deleteItem: (id: number) => request<void>(`/api/items${q({ id })}`, { method: 'DELETE' }),

  linkPreview: (url: string, signal?: AbortSignal) =>
    request<{ preview: LinkPreview }>('/api/link-preview', { method: 'POST', body: { url }, signal }).then((r) => r.preview),

  createOccasion: (listId: number, input: OccasionInput) =>
    request<{ occasion: Occasion }>('/api/occasions', { method: 'POST', body: { listId, ...input } }).then((r) => r.occasion),
  updateOccasion: (id: number, input: OccasionInput) =>
    request<{ occasion: Occasion }>(`/api/occasions${q({ id })}`, { method: 'PATCH', body: input }).then((r) => r.occasion),
  deleteOccasion: (id: number) => request<void>(`/api/occasions${q({ id })}`, { method: 'DELETE' }),

  setPick: (itemId: number, occasionId: number, picked: boolean) =>
    request<{ item: Idea }>('/api/picks', { method: 'PUT', body: { itemId, occasionId, picked } }).then((r) => r.item),
  claim: (itemId: number) => request<{ item: Idea }>(`/api/claims${q({ itemId })}`, { method: 'POST' }).then((r) => r.item),
  unclaim: (itemId: number) => request<{ item: Idea }>(`/api/claims${q({ itemId })}`, { method: 'DELETE' }).then((r) => r.item),

  setSharing: (listId: number, enabled: boolean) =>
    request<{ share: ShareState }>(`/api/share${q({ listId })}`, { method: 'PUT', body: { enabled } }).then((r) => r.share),
  rotateShare: (listId: number) =>
    request<{ share: ShareState }>(`/api/share/rotate${q({ listId })}`, { method: 'POST' }).then((r) => r.share),

  publicList: (token: string) => request<PublicListResponse>(`/api/public${q({ token })}`, { optionalAuth: true }),
  reserve: (token: string, itemId: number, email?: string) =>
    request<ReserveResponse>('/api/public/reserve', { method: 'POST', body: { token, itemId, email }, optionalAuth: true }),
  unreserve: (token: string, itemId: number, undoToken?: string) =>
    request<{ item: PublicItem }>('/api/public/reserve', {
      method: 'DELETE',
      body: { token, itemId, undoToken },
      optionalAuth: true,
    }).then((r) => r.item),

  invite: (listId: number, email: string) => request<InviteResponse>('/api/members', { method: 'POST', body: { listId, email } }),
  removeMember: (id: number) => request<void>(`/api/members${q({ id })}`, { method: 'DELETE' }),
  inviteLink: (listId: number) =>
    request<{ inviteUrl: string }>(`/api/members/link${q({ listId })}`, { method: 'POST' }).then((r) => r.inviteUrl),
  invitePreview: (token: string) => request<InvitePreview>(`/api/invite${q({ token })}`),
  acceptInvite: (token: string) =>
    request<{ listId: number }>('/api/invite/accept', { method: 'POST', body: { token } }).then((r) => r.listId),
};
