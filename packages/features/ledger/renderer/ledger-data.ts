import { useEffect } from 'react';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';

import { bridge } from '@midnite/studio-frame';
import type { LedgerReport, LedgerReportKind, ImportMapping, ImportPreview, LedgerBridge, LedgerBookDetail, LedgerBookSummary, LedgerResult, JournalEntry } from '@midnite/studio-shared';

export const ledgerApi = (): LedgerBridge | undefined => bridge()?.ledger;

/** A failed op as a thrown error, so react-query carries its `kind` to the view. */
export class LedgerOpError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

async function unwrap<T>(run: (api: LedgerBridge) => Promise<LedgerResult<T>>): Promise<T> {
  const api = ledgerApi();
  if (!api) throw new LedgerOpError('io', 'Books are not available in this window.');
  const result = await run(api);
  if (!result.ok) throw new LedgerOpError(result.kind, result.message);
  return result.value;
}

const STALE = 30_000;

/** Invalidates every ledger query when a book changes (this window's write, or another app's once seen). */
export function useLedgerSync(): void {
  const client = useQueryClient();
  useEffect(() => {
    const off = ledgerApi()?.onChanged?.(() => void client.invalidateQueries({ queryKey: ['ledger'] }));
    return () => off?.();
  }, [client]);
}

export const useBooks = () =>
  useQuery<{ books: LedgerBookSummary[] }, LedgerOpError>({ queryKey: ['ledger', 'books', 'listBooks'], queryFn: () => unwrap((a) => a.listBooks()), staleTime: STALE });

export const useBookDetail = (bookId: string | null) =>
  useQuery<LedgerBookDetail, LedgerOpError>({
    queryKey: ['ledger', bookId, 'getBook'],
    queryFn: () => unwrap((a) => a.getBook({ bookId: bookId as string })),
    enabled: bookId !== null,
    staleTime: STALE,
  });

export const useBalances = (bookId: string | null, asOf: string | null) =>
  useQuery<{ balances: { accountId: string; debit: number; credit: number }[] }, LedgerOpError>({
    queryKey: ['ledger', bookId, 'balances', asOf],
    queryFn: () => unwrap((a) => a.balances({ bookId: bookId as string, asOf: asOf as string })),
    enabled: bookId !== null && asOf !== null,
    staleTime: STALE,
  });

export type JournalFilter = { accountId: string | null; query: string };

export const useJournal = (bookId: string | null, filter: JournalFilter) =>
  useInfiniteQuery<{ entries: JournalEntry[]; nextCursor: string | null }, LedgerOpError, { pages: { entries: JournalEntry[]; nextCursor: string | null }[] }, unknown[], string | undefined>({
    queryKey: ['ledger', bookId, 'journal', filter],
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      unwrap((a) =>
        a.journal({
          bookId: bookId as string,
          limit: 100,
          ...(filter.accountId ? { accountId: filter.accountId } : {}),
          ...(filter.query.trim() ? { query: filter.query.trim() } : {}),
          ...(pageParam ? { cursor: pageParam } : {}),
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: bookId !== null,
    staleTime: STALE,
  });

/**
 * Runs a write and invalidates every ledger query on success. A failure is returned, not thrown, so the
 * control that sent it can render the message under itself.
 */
export function useLedgerCall(): <T>(run: (api: LedgerBridge) => Promise<LedgerResult<T>>) => Promise<LedgerResult<T>> {
  const client = useQueryClient();
  return async (run) => {
    const api = ledgerApi();
    if (!api) return { ok: false, kind: 'io', message: 'Books are not available in this window.' };
    let result: Awaited<ReturnType<typeof run>>;
    try {
      result = await run(api);
    } catch (err) {
      return { ok: false, kind: 'io', message: err instanceof Error ? err.message : 'The request failed.' };
    }
    if (result.ok) await client.invalidateQueries({ queryKey: ['ledger'] });
    return result;
  };
}

/** A statement read through a mapping: every row with its suggested account and duplicate flag. */
export const useImportPreview = (bookId: string | null, mapping: ImportMapping | null) =>
  useQuery<ImportPreview, LedgerOpError>({
    queryKey: ['ledger', bookId, 'importPreview', mapping],
    queryFn: () => unwrap((a) => a.importPreview({ bookId: bookId as string, mapping: mapping as ImportMapping })),
    enabled: bookId !== null && mapping !== null,
    staleTime: STALE,
    placeholderData: (previous) => previous,
  });

export const useReport = (bookId: string | null, kind: LedgerReportKind, from: string, to: string) =>
  useQuery<LedgerReport, LedgerOpError>({
    queryKey: ['ledger', bookId, 'report', kind, from, to],
    queryFn: () => unwrap((a) => a.report({ bookId: bookId as string, kind, from, to })),
    enabled: bookId !== null && from !== '' && to !== '' && from <= to,
    staleTime: STALE,
  });
