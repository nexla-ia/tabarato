import { QueryClient } from '@tanstack/react-query'

// Singleton compartilhado para que o logout (auth.store) possa limpar o cache.
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})
