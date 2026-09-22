import { useState } from 'react';
import { LuCheck } from 'react-icons/lu';

import type { ForgeAccount } from '@midnite/studio-shared';

import { UserAvatar } from '../../../components/user-avatar';
import { useAddForgeAccount, useForgeAccounts } from '../../../services/queries';
import {
  PROVIDER_HOST,
  PROVIDER_LABEL,
  PROVIDER_TOKEN_HINT,
  type SupportedKind,
} from '../../settings/settings-pages/accounts-page';
import { TextField } from '../../settings/settings-pages/controls';

const SUPPORTED_KINDS: readonly SupportedKind[] = ['github', 'gitlab', 'bitbucket', 'azure'];

/**
 * Step two — optional. Four provider cards, one `whoami`-validated add per
 * card (Theme B's `useAddForgeAccount`, the same mutation
 * `accounts-page.tsx`'s form drives), so a token pasted here is stored and
 * verified exactly the way it would be from Settings ▸ Accounts — this step
 * is not a second credential path, only an earlier door to the first one.
 *
 * GitHub gets no required field: an empty token asks main to detect the
 * account already signed in via `gh` (`delegated: 'gh'`), matching the card's
 * own hint text.
 */
export function ForgeConnectStep() {
  const { data: accounts = [] } = useForgeAccounts();

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Optional. Connect the forges you use so this app can show their pulls, issues and checks —
        skip this and add an account later from Settings ▸ Accounts.
      </p>
      {SUPPORTED_KINDS.map((kind) => (
        <ForgeCard
          key={kind}
          kind={kind}
          account={accounts.find((candidate) => candidate.kind === kind) ?? null}
        />
      ))}
    </div>
  );
}

function ForgeCard({ kind, account }: { kind: SupportedKind; account: ForgeAccount | null }) {
  const addAccount = useAddForgeAccount();
  const [token, setToken] = useState('');

  if (account) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-2.5 py-2">
        <UserAvatar login={account.login} name={account.displayName} src={account.avatarUrl} size={20} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{PROVIDER_LABEL[kind]}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {account.displayName || account.login}
          </p>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <LuCheck aria-hidden className="h-3.5 w-3.5" />
          Connected
        </span>
      </div>
    );
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    addAccount.mutate(
      { kind, host: PROVIDER_HOST[kind], token: token.trim() || undefined },
      { onSuccess: (result) => result.ok && setToken('') },
    );
  };

  const error = addAccount.data && !addAccount.data.ok ? addAccount.data.error : null;

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-card/50 px-2.5 py-2"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{PROVIDER_LABEL[kind]}</p>
        <button
          type="submit"
          disabled={addAccount.isPending || (kind !== 'github' && token.trim().length === 0)}
          className="h-6 shrink-0 rounded-md border border-border px-2 text-[11px] transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {addAccount.isPending ? 'Verifying…' : 'Connect'}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{PROVIDER_TOKEN_HINT[kind]}</p>
      <TextField
        value={token}
        onChange={setToken}
        label={`${PROVIDER_LABEL[kind]} personal access token`}
        placeholder={kind === 'github' ? '(optional — detected via gh)' : 'paste a token'}
        className="font-mono"
      />
      {error ? (
        <p role="alert" className="text-[11px] text-red-500">
          {error}
        </p>
      ) : null}
    </form>
  );
}
