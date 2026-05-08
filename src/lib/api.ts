import { supabase } from './supabase';

export interface User {
  id: string;
  email: string;
}

export interface WishlistItem {
  id: number;
  wishlistId: number;
  name: string;
  url: string;
  imageUrl: string;
  notes: string;
  priceCents: number;
  priority: number;
  reserved: boolean;
  createdAt: string;
}

export interface Wishlist {
  id: number;
  title: string;
  createdAt: string;
  items: WishlistItem[];
}

interface JsonErrorResponse {
  error?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

async function authHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token
    ? {
        Authorization: `Bearer ${session.access_token}`,
      }
    : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');

  const authorizationHeaders = await authHeaders();
  if (authorizationHeaders.Authorization) {
    headers.set('Authorization', authorizationHeaders.Authorization);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...init,
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const errorPayload = (await response.json()) as JsonErrorResponse;
      message = errorPayload.error ?? message;
    } catch {
      message = await response.text();
    }
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function fetchSession() {
  return request<{ user: User }>('/api/auth/me');
}

export function fetchWishlist() {
  return request<{ wishlist: Wishlist }>('/api/wishlist');
}

export function createWishlistItem(payload: {
  name: string;
  url: string;
  notes: string;
  priceCents: number;
  priority: number;
}) {
  return request<{ item: WishlistItem }>('/api/wishlist/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateWishlistItem(itemId: number, payload: { reserved: boolean }) {
  return request<{ item: WishlistItem }>(`/api/wishlist/items?id=${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteWishlistItem(itemId: number) {
  return request<void>(`/api/wishlist/items?id=${itemId}`, {
    method: 'DELETE',
  });
}
