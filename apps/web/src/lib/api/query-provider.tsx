'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Provider TanStack Query (état serveur global de la PWA).
 *
 * Une `QueryClient` par instance React (useState pour ne pas la recréer entre
 * re-renders). Defaults choisis pour le contexte MATA :
 *  - retry: 1            → on retry une fois (le réseau peut hoqueter), mais
 *                          pas de boucle agressive sur 4xx (handled per-hook)
 *  - staleTime: 30s      → on évite les refetch intempestifs lors de la
 *                          navigation rapide entre écrans
 *  - refetchOnWindowFocus: false → comportement attendu d'une PWA mobile
 *
 * Les hooks individuels peuvent override (ex: useZones avec staleTime: 5min).
 */
export function QueryProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              // Pas de retry sur 4xx (sauf 401/408/429)
              if (error instanceof Error && 'status' in error) {
                const status = (error as { status: number }).status;
                if (status >= 400 && status < 500 && ![408, 429].includes(status)) return false;
              }
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
