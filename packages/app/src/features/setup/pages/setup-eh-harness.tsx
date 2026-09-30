import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

/** Shared bridge mock for the Theme E/H page tests: `setup.probe` answers from a map of id → version (absent = not installed). */
export function installSetupBridge(
  versions: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  const probe = vi.fn(async ({ ids }: { ids: string[] }) => ({
    results: ids.map((id) => ({
      id,
      installed: id in versions,
      version: versions[id] ?? null,
      path: id in versions ? `/opt/homebrew/bin/${id}` : null,
    })),
  }));
  (window as unknown as { midniteStudio: unknown }).midniteStudio = { setup: { probe }, ...extra };
  return probe;
}

export function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}
