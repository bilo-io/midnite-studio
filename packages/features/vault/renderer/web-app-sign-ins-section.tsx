import { bridge, useFrameChrome } from '@midnite/studio-frame';
import type { schemas, WebAppSignIn } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';
import type { z } from 'zod';

import { useVaultHost } from './host';

type SignIns = z.infer<typeof schemas.WebAppsSignInsResponse>;

const cookies = (n: number) => `${n} cookie${n === 1 ? '' : 's'}`;

/**
 * Web-app sign-ins (Phase 113 Theme J slice 3): for each web app on the rail, whether its own
 * `persist:app-<id>` partition holds a sign-in — how many cookies, and the sites they belong to.
 * **Never a cookie, a token or what the partition stores**: the wire carries a count and domain names
 * only (`WebAppSignInSchema`).
 *
 * Sign in opens the app where the composing app keeps it (Studio: its rail's flyout) — the user signs in
 * there, in the app's own session. Sign out clears that one partition behind the kit's destructive
 * confirm, which shows what goes: the cookie count and the sites it signs you out of. Nothing here signs
 * anyone out on its own, and no partition is renamed.
 */
export function WebAppSignInsSection() {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const { openWebApp } = useVaultHost();
  const [signIns, setSignIns] = useState<SignIns | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const webApps = bridge()?.webApps;
    setSignIns(webApps?.signIns ? await webApps.signIns({}) : { available: false, apps: [] });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = (app: WebAppSignIn) =>
    dialogs.confirm({
      title: `Sign out of ${app.label}?`,
      body: `Clears ${app.label}'s own browser session — its cookies, site storage and cache. Other web apps and the browser keep theirs. Sign in again from ${app.label} itself.`,
      confirmLabel: 'Sign out',
      danger: true,
      blastRadiusKind: 'cookies',
      blastRadius: { count: app.cookieCount, sample: [] },
      ...(app.origins.length > 0 ? { warnings: [`Signs you out of ${app.origins.join(', ')}.`] } : {}),
      onConfirm: () => {
        void bridge()
          ?.webApps.signOut({ id: app.id })
          .then((result) => {
            setError(result.ok ? null : result.message);
            return refresh();
          });
      },
    });

  return (
    <section aria-labelledby="vault-web-apps" className="rounded-lg border border-border p-4">
      <h2 id="vault-web-apps" className="mb-1 text-sm font-medium">
        Web-app sign-ins
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Each web app keeps its own browser session. Listed here: how many cookies it holds and the sites they
        belong to — never a cookie or anything it stores.
      </p>
      {signIns && !signIns.available ? (
        <p className="text-xs text-muted-foreground">{signIns.reason ?? 'Web-app sign-ins are not available here.'}</p>
      ) : null}
      <ul className="divide-y divide-border">
        {(signIns?.apps ?? []).map((app) => (
          <li key={app.id} className="flex items-center gap-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{app.label}</span>
              <span className="block truncate text-muted-foreground">
                {app.cookieCount > 0 ? `${cookies(app.cookieCount)} · ${app.origins.join(', ')}` : 'Nothing stored — not signed in'}
              </span>
            </span>
            {openWebApp ? (
              <button type="button" onClick={() => openWebApp(app.id)} aria-label={`Sign in to ${app.label}`}>
                Sign in
              </button>
            ) : null}
            {app.cookieCount > 0 ? (
              <button type="button" onClick={() => signOut(app)} aria-label={`Sign out of ${app.label}`}>
                Sign out
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
