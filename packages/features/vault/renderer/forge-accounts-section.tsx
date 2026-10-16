import { bridge, useFrameChrome } from '@midnite/studio-frame';
import type { ForgeAccount } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

const KINDS = ['github', 'gitlab', 'bitbucket', 'azure'] as const;

/**
 * Forge accounts: provider, host, login and whether a token is held
 * (`hasToken`) — never the token. Adding sends the token one way, through the
 * existing `forgeAccountAdd` channel, which validates it against the provider
 * before anything is stored; removing is confirmed.
 */
export function ForgeAccountsSection() {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const [accounts, setAccounts] = useState<ForgeAccount[] | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]>('github');
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const forge = bridge()?.forgeAccounts;
    setAccounts(forge ? await forge.list({}) : []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const add = async () => {
    const result = await bridge()?.forgeAccounts.add({
      kind,
      host: host.trim() || (kind === 'github' ? 'github.com' : host),
      ...(token ? { token } : {}),
    });
    if (result && !result.ok) return setError(result.error);
    setError(null);
    setHost('');
    setToken('');
    await refresh();
  };

  const remove = (account: ForgeAccount) =>
    dialogs.confirm({
      title: `Remove ${account.login} on ${account.host}?`,
      body: 'The stored token is deleted. The account stays on the provider.',
      confirmLabel: 'Remove',
      danger: true,
      blastRadiusKind: 'secrets',
      blastRadius: { count: account.hasToken ? 1 : 0, sample: [] },
      onConfirm: () => {
        void bridge()?.forgeAccounts.remove({ id: account.id }).then(refresh);
      },
    });

  return (
    <section aria-labelledby="vault-forge" className="rounded-lg border border-border p-4">
      <h2 id="vault-forge" className="mb-3 text-sm font-medium">Forge accounts</h2>
      {accounts?.length === 0 ? (
        <p className="mb-3 text-xs text-muted-foreground">
          No accounts yet. Until the runtime migration is switched on, this list is empty in a standalone Vault.
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {(accounts ?? []).map((account) => (
          <li key={account.id} className="flex items-center gap-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{account.login}</span>
              <span className="block text-muted-foreground">{account.kind} · {account.host}</span>
            </span>
            <span>{account.delegated === 'gh' ? 'Delegated to gh' : account.hasToken ? 'Token stored' : 'No token'}</span>
            <button type="button" onClick={() => remove(account)}>Remove</button>
          </li>
        ))}
      </ul>
      <form className="mt-3 flex flex-wrap items-center gap-2 text-xs" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <select aria-label="Provider" value={kind} onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input aria-label="Host" placeholder="host (github.com)" value={host} onChange={(e) => setHost(e.target.value)} className="rounded border border-border bg-background px-2 py-1" />
        <input aria-label="Access token" type="password" autoComplete="off" placeholder="access token" value={token} onChange={(e) => setToken(e.target.value)} className="rounded border border-border bg-background px-2 py-1" />
        <button type="submit">Add account</button>
        {error ? <span role="alert" className="text-destructive">{error}</span> : null}
      </form>
    </section>
  );
}
