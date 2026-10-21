import { bridge, useFrameChrome } from '@midnite/studio-frame';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

type Listing = Awaited<ReturnType<NonNullable<MidniteStudioBridge['vaultPairings']>['list']>>;

/**
 * Which apps have paired with the vault (docs/APPS.md, "Pairing"). An app pairs itself the first
 * time it opens with Studio running; from then on only its own key is accepted under its name. A
 * **pairing conflict** means something else tried to use that name with a different key — or the
 * app's own key was reset. Unpair is the only way to re-pair: the app's next launch binds afresh.
 * Names and times only cross the wire; never a key.
 */
export function PairingSection() {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const [listing, setListing] = useState<Listing | null>(null);

  const refresh = useCallback(async () => {
    const api = bridge()?.vaultPairings;
    setListing(api ? await api.list({}) : { apps: [] });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unpair = (appId: Listing['apps'][number]['appId']) =>
    dialogs.confirm({
      title: `Unpair ${appId}?`,
      body: `${appId} loses access until it next opens, when it pairs again with whatever key it then presents. Do this when you trust the ${appId} you are about to open.`,
      confirmLabel: 'Unpair',
      danger: true,
      blastRadiusKind: 'vaultAccess',
      blastRadius: { count: 1, sample: [] },
      onConfirm: () => {
        void bridge()
          ?.vaultPairings?.unpair({ appId })
          .then(refresh);
      },
    });

  return (
    <section aria-labelledby="vault-pairing" className="rounded-lg border border-border p-4">
      <h2 id="vault-pairing" className="mb-1 text-sm font-medium">
        Paired apps
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        An app pairs the first time it opens while Studio is running. A paired app still uses only
        what App access allows.
      </p>
      {listing === null ? null : listing.apps.length === 0 ? (
        <p className="text-xs text-muted-foreground">No app has paired yet.</p>
      ) : (
        <ul className="divide-y divide-border text-xs">
          {listing.apps.map(({ appId, pairedAt, conflict }) => (
            <li key={appId} className="flex items-baseline justify-between gap-3 py-1.5">
              <span>
                <span className="font-medium">{appId}</span>
                <span className="ml-2 text-muted-foreground">paired {new Date(pairedAt).toLocaleString()}</span>
                {conflict ? (
                  <span role="alert" className="ml-2 text-destructive">
                    Pairing conflict — {conflict.count} refused since {new Date(conflict.at).toLocaleString()}
                  </span>
                ) : null}
              </span>
              <button type="button" className="text-primary hover:underline" onClick={() => unpair(appId)}>
                Unpair
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
