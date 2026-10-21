import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { AccountConnectorId, AccountEnvironment, GitOpResult } from '@midnite/studio-shared';

import { bridge } from '@midnite/studio-frame';

/**
 * Data hooks for the brokerage accounts (Phase 113 Theme P slice 2). Every call goes through
 * `window.midniteStudio.financeAccounts`; the only thing that ever travels toward main with a
 * credential in it is `useAddAccount` / `useTestAccount`'s `fields`, and nothing comes back with
 * one — there is no read for it to come back from.
 */

const unwrap = async <T,>(call: Promise<GitOpResult<T>> | undefined, fallback: string): Promise<T> => {
  if (!call) throw new Error(fallback);
  const result = await call;
  if (!result.ok) throw new Error(result.kind === 'error' ? result.message : fallback);
  return (result as { value: T }).value;
};

export const ACCOUNT_KEYS = {
  list: ['finance-accounts', 'list'] as const,
  snapshots: ['finance-accounts', 'snapshots'] as const,
};

/** Snapshots are cached in main for a minute; polling a little slower than that keeps the numbers fresh. */
const SNAPSHOT_POLL_MS = 90_000;

export function useAccountList() {
  return useQuery({
    queryKey: ACCOUNT_KEYS.list,
    queryFn: () => unwrap(bridge()?.financeAccounts.list(), 'Accounts are unavailable in this app.'),
    staleTime: Infinity,
  });
}

export function useAccountSnapshots(enabled: boolean) {
  return useQuery({
    queryKey: ACCOUNT_KEYS.snapshots,
    queryFn: () => unwrap(bridge()?.financeAccounts.snapshots({}), 'Accounts are unavailable in this app.'),
    enabled,
    staleTime: SNAPSHOT_POLL_MS,
    refetchInterval: SNAPSHOT_POLL_MS,
  });
}

export type AccountDraft = {
  connector: AccountConnectorId;
  environment: AccountEnvironment;
  /** The write-only credential bag, keyed by the connector's declared input names. */
  fields: Record<string, string>;
};

export function useTestAccount() {
  return useMutation({
    mutationFn: (draft: AccountDraft) =>
      unwrap(bridge()?.financeAccounts.test(draft), 'Accounts are unavailable in this app.'),
  });
}

export function useAddAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: AccountDraft & { label: string }) =>
      unwrap(bridge()?.financeAccounts.add(draft), 'Accounts are unavailable in this app.'),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['finance-accounts'] });
    },
  });
}

export function useRemoveAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(bridge()?.financeAccounts.remove({ id }), 'Accounts are unavailable in this app.'),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['finance-accounts'] });
    },
  });
}

export function useRefreshAccounts() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(bridge()?.financeAccounts.snapshots({ refresh: true }), 'Accounts are unavailable in this app.'),
    onSuccess: (value) => {
      client.setQueryData(ACCOUNT_KEYS.snapshots, value);
    },
  });
}
