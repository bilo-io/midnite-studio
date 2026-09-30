import { useEffect, useState } from 'react';
import { LuCheck } from 'react-icons/lu';

import { prefillGitIdentity, GIT_EMAIL_PATTERN, type ForgeAccount, type GitIdentity } from '@midnite/studio-shared';

import { UserAvatar } from '../../../components/user-avatar';
import { useAddForgeAccount, useForgeAccounts, useSwitchForgeAccount } from '../../../services/queries';
import {
  PROVIDER_HOST,
  PROVIDER_ICON,
  PROVIDER_LABEL,
  PROVIDER_TOKEN_HINT,
  type SupportedKind,
} from '../../settings/settings-pages/accounts-page';
import { TextField } from '../../settings/settings-pages/controls';

const KINDS: readonly SupportedKind[] = ['github', 'gitlab', 'bitbucket', 'azure'];

/**
 * Accounts and git identity (Phase 98 Theme F) — a page over two pieces that
 * already exist: Phase 90's forge-account registry (`useForgeAccounts`, which
 * already merges vaulted accounts with the `gh`-delegated one) and the new
 * global git identity channel.
 *
 * Picking an account card makes it the active forge account
 * (`useSwitchForgeAccount`, the same call Settings ▸ Accounts makes) and
 * pre-fills the identity form from it; the form writes `git config --global`.
 * Adding an account is the same `useAddForgeAccount` token flow the forges
 * page uses — this page is not a second credential path.
 */
export function AccountsPage() {
  const gitIdentity = typeof window !== 'undefined' ? window.midniteStudio?.gitIdentity : undefined;
  const { data: accounts = [] } = useForgeAccounts();
  const switchAccount = useSwitchForgeAccount();

  const [current, setCurrent] = useState<GitIdentity | null>(null);
  const [draft, setDraft] = useState<GitIdentity>({ name: '', email: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!gitIdentity) return;
    let live = true;
    void gitIdentity.get().then((result) => {
      if (!live || !result.ok) return;
      setCurrent(result.value);
      setDraft((previous) => (previous.name || previous.email ? previous : result.value));
    });
    return () => {
      live = false;
    };
  }, [gitIdentity]);

  const select = (account: ForgeAccount): void => {
    setSelectedId(account.id);
    setMessage(null);
    setDraft(prefillGitIdentity(account, current ?? { name: '', email: '' }));
    switchAccount.mutate(account.id);
  };

  const emailValid = GIT_EMAIL_PATTERN.test(draft.email.trim());
  const canSave = Boolean(gitIdentity) && draft.name.trim().length > 0 && emailValid && !saving;

  const save = async (): Promise<void> => {
    if (!gitIdentity) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await gitIdentity.set({ name: draft.name, email: draft.email });
      if (result.ok) {
        setCurrent(result.value);
        setDraft(result.value);
        setMessage({ tone: 'ok', text: 'Saved to your global git config.' });
      } else {
        setMessage({ tone: 'error', text: result.kind === 'error' ? result.message : 'Could not save.' });
      }
    } catch {
      setMessage({ tone: 'error', text: 'Could not save.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Pick the account you commit as. Its name and email fill the form below, which sets your global git identity —
        the author on every commit you make.
      </p>

      {accounts.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-label="Forge accounts">
          {accounts.map((account) => (
            <li key={account.id}>
              <AccountCard account={account} selected={selectedId === account.id} onSelect={() => select(account)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
          No forge account yet. Add one below, or sign in with <code className="font-mono">gh auth login</code>.
        </p>
      )}

      <form
        data-testid="setup-git-identity"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) void save();
        }}
        className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/50 p-3"
      >
        <p className="text-xs font-medium">Git identity</p>
        <TextField value={draft.name} onChange={(name) => setDraft({ ...draft, name })} label="Name" placeholder="Ada Lovelace" />
        <TextField
          value={draft.email}
          onChange={(email) => setDraft({ ...draft, email })}
          label="Email"
          placeholder="ada@example.com"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={!canSave}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Set as git identity'}
          </button>
          {current && (current.name || current.email) ? (
            <span className="truncate text-[11px] text-muted-foreground">
              Now: {current.name || '(no name)'} &lt;{current.email || 'no email'}&gt;
            </span>
          ) : null}
        </div>
        {message ? (
          <p role={message.tone === 'error' ? 'alert' : 'status'} className={`text-[11px] ${message.tone === 'error' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {message.text}
          </p>
        ) : null}
      </form>

      <AddAccount />
    </div>
  );
}

function AccountCard({
  account,
  selected,
  onSelect,
}: {
  account: ForgeAccount;
  selected: boolean;
  onSelect: () => void;
}) {
  const kind = account.kind as SupportedKind;
  const ForgeIcon = PROVIDER_ICON[kind];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-accent/50 ${
        selected ? 'border-primary bg-primary/5' : 'border-border/60 bg-card/50'
      }`}
    >
      <UserAvatar login={account.login} name={account.displayName} src={account.avatarUrl} size={28} withTooltip={false} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{account.displayName || account.login}</span>
        <span className="truncate text-xs text-muted-foreground">
          @{account.login} · {account.email || 'email not shared'}
        </span>
      </span>
      {ForgeIcon ? <ForgeIcon aria-label={PROVIDER_LABEL[kind]} className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      {selected ? <LuCheck aria-hidden className="h-4 w-4 shrink-0 text-primary" /> : null}
    </button>
  );
}

/** The forges page's token flow, as a compact form: a provider, a token, `whoami` validation. */
function AddAccount() {
  const add = useAddForgeAccount();
  const [kind, setKind] = useState<SupportedKind>('github');
  const [token, setToken] = useState('');
  const error = add.data && !add.data.ok ? add.data.error : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate(
          { kind, host: PROVIDER_HOST[kind], token: token.trim() || undefined },
          { onSuccess: (result) => result.ok && setToken('') },
        );
      }}
      className="flex flex-col gap-2 rounded-md border border-border/60 bg-card/50 p-3"
    >
      <p className="text-xs font-medium">Add an account</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Provider">
        {KINDS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={kind === candidate}
            onClick={() => setKind(candidate)}
            className={`rounded-md border px-2 py-0.5 text-[11px] ${
              kind === candidate ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'
            }`}
          >
            {PROVIDER_LABEL[candidate]}
          </button>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{PROVIDER_TOKEN_HINT[kind]}</p>
      <TextField
        value={token}
        onChange={setToken}
        label={`${PROVIDER_LABEL[kind]} personal access token`}
        placeholder={kind === 'github' ? '(optional — detected via gh)' : 'paste a token'}
        className="font-mono"
      />
      <div>
        <button
          type="submit"
          disabled={add.isPending || (kind !== 'github' && token.trim().length === 0)}
          className="h-6 rounded-md border border-border px-2 text-[11px] hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {add.isPending ? 'Verifying…' : `Add ${PROVIDER_LABEL[kind]} account`}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[11px] text-red-500">
          {error}
        </p>
      ) : null}
    </form>
  );
}
