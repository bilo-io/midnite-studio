import { Accordion } from '@bilo-io/ui';
import { useState } from 'react';
import { LuCircleUserRound, LuInfo, LuPlus, LuTrash2 } from 'react-icons/lu';

import type { ForgeAccount, ForgeKind } from '@midnite/studio-shared';

import { UserAvatar } from '../../../components/user-avatar';
import {
  useAddForgeAccount,
  useForgeAccounts,
  useRemoveForgeAccount,
  useSwitchForgeAccount,
} from '../../../services/queries';
import { useUiStore } from '../../../store/ui-store';
import { Choice, Field, TextField } from './controls';

type SupportedKind = Exclude<ForgeKind, 'unknown'>;

/**
 * No self-hosted host picker — Theme B's own scope guardrail (matching
 * `CLAUDE.md`'s "no self-hosted GitLab/Bitbucket Server/Azure DevOps Server"
 * line). Each of these three hosts is the one real one for its kind; a
 * self-hosted instance is recognised by the URL parser (Theme A) and
 * declared `unsupported` by the capability matrix rather than offered here.
 */
const PROVIDER_HOST: Record<SupportedKind, string> = {
  github: 'github.com',
  gitlab: 'gitlab.com',
  bitbucket: 'bitbucket.org',
  azure: 'dev.azure.com',
};

const PROVIDER_LABEL: Record<SupportedKind, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  azure: 'Azure DevOps',
};

/** The exact scopes each provider needs, spelled out — `projects-page.tsx`'s
 *  own style for `gh auth refresh -s project`. */
const PROVIDER_TOKEN_HINT: Record<SupportedKind, string> = {
  github:
    'Leave this blank to use the GitHub CLI (`gh auth login`) — the same credential every other GitHub read in this app already uses. Paste a personal access token only to add a second GitHub identity.',
  gitlab: 'A personal access token with the `read_api` scope (Settings ▸ Access Tokens on gitlab.com).',
  bitbucket:
    'A workspace API token, or an App Password, with repository read access (Personal settings ▸ App passwords).',
  azure:
    'A personal access token with Code (Read), Work Items (Read & Write) and Build (Read) scopes (User settings ▸ Personal access tokens).',
};

/**
 * Settings ▸ Accounts (Phase 90 Theme B) — the "who am I" page this app has
 * never had. One row per stored account, an active marker, add/remove, and a
 * PAT field per new provider with its exact scopes spelled out.
 *
 * This is `forgeAccounts` and `forgeActiveAccountId`'s home in `ui-store.ts`
 * — `persisted-keys.ts` requires every preference to be named under a real
 * settings page, and this is it.
 *
 * No self-hosted host field and no OAuth button — see the phase doc's own
 * Decisions: a pasted PAT is the credential for all three new providers, and
 * `gitlab.com`/`bitbucket.org`/`dev.azure.com` are the only hosts this phase
 * supports.
 */
export function AccountsPage() {
  const { data: accounts = [] } = useForgeAccounts();
  const addAccount = useAddForgeAccount();
  const removeAccount = useRemoveForgeAccount();
  const switchAccount = useSwitchForgeAccount();

  const [kind, setKind] = useState<SupportedKind>('github');
  const [token, setToken] = useState('');

  const activeId = useUiStore((s) => s.forgeActiveAccountId);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    addAccount.mutate(
      { kind, host: PROVIDER_HOST[kind], token: token.trim() || undefined },
      { onSuccess: (result) => result.ok && setToken('') },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Accordion title="Accounts" icon={<LuCircleUserRound className="h-4 w-4" />} defaultOpen>
        <div className="flex flex-col gap-2 p-3">
          {accounts.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              No accounts yet. GitHub reads through this app's existing `gh` sign-in with no setup
              here — add one below only for a second GitHub identity, or for GitLab, Bitbucket or
              Azure DevOps.
            </p>
          ) : (
            accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                active={account.id === activeId}
                onMakeActive={() => switchAccount.mutate(account.id)}
                onRemove={() => removeAccount.mutate(account.id)}
              />
            ))
          )}
        </div>
      </Accordion>

      <Accordion title="Add an account" icon={<LuPlus className="h-4 w-4" />} defaultOpen>
        <form className="flex flex-col gap-3 p-3" onSubmit={submit}>
          <Choice<SupportedKind>
            label="Provider"
            hint="Which forge this identity belongs to."
            value={kind}
            onChange={setKind}
            options={[
              ['github', PROVIDER_LABEL.github],
              ['gitlab', PROVIDER_LABEL.gitlab],
              ['bitbucket', PROVIDER_LABEL.bitbucket],
              ['azure', PROVIDER_LABEL.azure],
            ]}
          />
          <Field label="Personal access token" hint={PROVIDER_TOKEN_HINT[kind]}>
            <TextField
              value={token}
              onChange={setToken}
              label="Personal access token"
              placeholder={kind === 'github' ? '(optional)' : 'paste a token'}
              className="font-mono"
            />
          </Field>
          {addAccount.data && !addAccount.data.ok ? (
            <p role="alert" className="text-[11px] text-red-500">
              {addAccount.data.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={addAccount.isPending || (kind !== 'github' && token.trim().length === 0)}
            className="h-7 w-fit rounded-md border border-border px-3 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addAccount.isPending ? 'Verifying…' : `Add ${PROVIDER_LABEL[kind]} account`}
          </button>
        </form>
      </Accordion>

      <Accordion title="How this works" icon={<LuInfo className="h-4 w-4" />}>
        <div className="flex flex-col gap-2 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <p>
            Adding an account validates the token first — a token this app cannot verify is never
            stored. GitHub accounts hold no token at all: <code>gh</code> remains the credential,
            exactly as every other GitHub read in this app already works.
          </p>
          <p>
            Every other token is encrypted with your OS keychain before it ever touches disk, and
            this page is only ever told whether a token exists — never what it is.
          </p>
        </div>
      </Accordion>
    </div>
  );
}

function AccountRow({
  account,
  active,
  onMakeActive,
  onRemove,
}: {
  account: ForgeAccount;
  active: boolean;
  onMakeActive: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/50 px-2 py-1.5">
      <UserAvatar login={account.login} name={account.displayName} src={account.avatarUrl} size={20} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{account.displayName || account.login}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {account.kind} · {account.host}
          {account.delegated === 'gh' ? ' · via gh' : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onMakeActive}
        aria-pressed={active}
        className={`h-6 shrink-0 rounded-md border px-2 text-[11px] transition-colors ${
          active
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:bg-accent'
        }`}
      >
        {active ? 'Active' : 'Make active'}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${account.displayName || account.login}`}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <LuTrash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
