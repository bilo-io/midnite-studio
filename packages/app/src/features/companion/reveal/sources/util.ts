import type { QueryKey } from '@tanstack/react-query';

import { appQueryClient } from '../../../../services/query-client';

/**
 * Small helpers the resolver's sources share. Nothing here fetches: `cached`
 * reads what a page already loaded into the main window's query client.
 */

/** Every cached payload under `prefix` — a forge listing is keyed by limit/state/scope too, so there can be several. */
export function cached<T>(prefix: QueryKey): T[] {
  return appQueryClient
    .getQueriesData<T>({ queryKey: prefix })
    .map(([, data]) => data)
    .filter((data): data is T => data !== undefined);
}

export function cachedOne<T>(key: QueryKey): T | undefined {
  return appQueryClient.getQueryData<T>(key);
}

/** An ISO date as epoch ms, or `undefined` when it is missing or unparseable. */
export function isoMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

export function stripExtension(name: string): string {
  return name.replace(/\.[^./]+$/, '');
}

/** Run `fn` over `items` with at most `limit` in flight — a source listing many folders stays polite. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}
