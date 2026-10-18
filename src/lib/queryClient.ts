import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // A 4xx won't change by asking again.
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

/** Query keys in one place, so mutations know what to refresh. */
export const keys = {
  overview: ['overview'] as const,
  list: (id: number) => ['list', id] as const,
  search: (q: string) => ['search', q] as const,
  shared: (token: string) => ['shared', token] as const,
};
