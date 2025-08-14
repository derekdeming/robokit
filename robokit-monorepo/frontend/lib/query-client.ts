import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        if (error && typeof error === 'object' && 'status' in error) {
          return error.status !== 404 && failureCount < 3;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: 1,
    },
  },
});