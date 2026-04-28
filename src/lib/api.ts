export interface User {
  id: number;
  email: string;
  createdAt: string;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
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

export function register(email: string, password: string) {
  return request<{ user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string) {
  return request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return request<void>('/api/auth/logout', {
    method: 'POST',
  });
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
