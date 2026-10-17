import { bridge, useFrameChrome } from '@midnite/studio-frame';
import { PLACEMENT_APP_IDS } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

type Namespace = 'secrets' | 'forge-accounts' | 'db-credentials';
type Scope = '*' | string[];
type Grants = Record<string, Partial<Record<Namespace, Scope>>>;

const NAMESPACES: { id: Namespace; label: string }[] = [
  { id: 'secrets', label: 'Secrets' },
  { id: 'forge-accounts', label: 'Forge accounts' },
  { id: 'db-credentials', label: 'Database logins' },
];

/** Studio and Vault are always allowed, so they are not rows; every other app starts with nothing. */
const GRANTEES = PLACEMENT_APP_IDS.filter((id) => id !== 'vault');

/**
 * Which apps may use which part of the vault. Deny by default: an app with no
 * toggle on can read and write nothing. A toggle grants a whole namespace;
 * revoking is confirmed. Only app ids and entry *names* cross the wire — the
 * grants file holds no value.
 */
export function GrantsSection() {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const [grants, setGrants] = useState<Grants | null>(null);
  const [corrupt, setCorrupt] = useState(false);

  const refresh = useCallback(async () => {
    const api = bridge()?.vaultGrants;
    if (!api) return setGrants({});
    const reply = await api.list({});
    setGrants(reply.grants as Grants);
    setCorrupt(reply.corrupt);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const grant = async (appId: string, namespace: Namespace) => {
    await bridge()?.vaultGrants.set({ appId: appId as never, namespace, scope: '*' });
    await refresh();
  };

  const revoke = (appId: string, label: string, namespace: Namespace) =>
    dialogs.confirm({
      title: `Revoke ${appId}'s access to ${label}?`,
      body: `${appId} can no longer read or change them until you grant access again.`,
      confirmLabel: 'Revoke',
      danger: true,
      blastRadiusKind: 'vaultAccess',
      blastRadius: { count: 1, sample: [] },
      onConfirm: () => {
        void bridge()
          ?.vaultGrants.revoke({ appId: appId as never, namespace })
          .then(refresh);
      },
    });

  return (
    <section aria-labelledby="vault-grants" className="rounded-lg border border-border p-4">
      <h2 id="vault-grants" className="mb-1 text-sm font-medium">
        App access
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Midnite Studio and Vault can always use the vault. Any other app can use only what is
        switched on here.
      </p>
      {corrupt ? (
        <p role="alert" className="mb-3 text-xs text-destructive">
          The grants file could not be read, so every other app is denied until you grant access
          again.
        </p>
      ) : null}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-normal">App</th>
            {NAMESPACES.map((ns) => (
              <th key={ns.id} className="py-1 font-normal">
                {ns.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {GRANTEES.map((appId) => (
            <tr key={appId}>
              <td className="py-2 font-medium">{appId}</td>
              {NAMESPACES.map((ns) => {
                const scope = grants?.[appId]?.[ns.id];
                return (
                  <td key={ns.id} className="py-2">
                    <input
                      type="checkbox"
                      aria-label={`Allow ${appId} to use ${ns.label}`}
                      disabled={grants === null}
                      checked={scope !== undefined}
                      onChange={() =>
                        scope === undefined
                          ? void grant(appId, ns.id)
                          : revoke(appId, ns.label, ns.id)
                      }
                    />
                    {Array.isArray(scope) ? (
                      <span className="ml-1 text-muted-foreground">{scope.length} entries</span>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
