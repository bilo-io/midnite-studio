import {
  signInOrigins,
  WEB_APP_DEFINITIONS,
  WEB_APP_IDS,
  type WebAppId,
  type WebAppSignIn,
  type schemas,
} from '@midnite/studio-shared';
import type { z } from 'zod';

import { browserMainDeps, defaultLogger } from './browser-main-deps';
import { reloadWebApp } from './web-apps-service';

type SignInsResponse = z.infer<typeof schemas.WebAppsSignInsResponse>;
type SignOutResponse = z.infer<typeof schemas.WebAppsSignOutResponse>;

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Which web apps' partitions hold a sign-in (Phase 113 Theme J slice 3) — what the Vault lists.
 *
 * **Never a value.** Each row is built from two things only: how many cookies the partition holds and
 * the domains they belong to. The cookie objects Electron returns are read for `domain` and dropped —
 * nothing here copies a name, value, path or the partition's storage into the answer, and the port
 * (`BrowserCookieDomain`) does not even name those fields. `web-app-sign-ins.test.ts` hands it cookies
 * carrying a canary value and checks the answer never contains it.
 *
 * Reading a partition never signs anyone out and never changes its name: it is `cookies.get({})` on
 * the same `persist:app-<id>` session the app's view uses.
 */
export async function listWebAppSignIns(): Promise<SignInsResponse> {
  try {
    const apps = await Promise.all(WEB_APP_IDS.map(signInFor));
    return { available: true, apps };
  } catch (error) {
    defaultLogger.warn(`[apps] could not read web-app sign-ins: ${errorText(error)}`);
    return { available: false, reason: 'Could not read the web apps’ sign-ins.', apps: [] };
  }
}

async function signInFor(id: WebAppId): Promise<WebAppSignIn> {
  const { label, partition } = WEB_APP_DEFINITIONS[id];
  const cookies = await browserMainDeps().electron.sessionFromPartition(partition).cookies.get({});
  return { id, label, partition, cookieCount: cookies.length, origins: signInOrigins(cookies.map((c) => c.domain)) };
}

/**
 * Sign out of one web app: clear that one partition's storage (cookies, local storage, IndexedDB,
 * service workers — Electron's `clearStorageData()` with no filter) and its HTTP cache, then reload the
 * app's live view if it has one. **Only this partition**: every other app, the browser's
 * `persist:browser` and the app's own window stay as they are. The renderer confirms first (the
 * Vault's blast-radius dialog); this is only ever reached by that explicit action.
 */
export async function signOutWebApp(id: WebAppId): Promise<SignOutResponse> {
  const { partition } = WEB_APP_DEFINITIONS[id];
  try {
    const session = browserMainDeps().electron.sessionFromPartition(partition);
    await session.clearStorageData();
    await session.clearCache();
    reloadWebApp(id);
    defaultLogger(`[apps] signed out: app=${id}`);
    return { ok: true };
  } catch (error) {
    defaultLogger.warn(`[apps] sign-out failed: app=${id}: ${errorText(error)}`);
    return { ok: false, message: `Could not sign out of ${WEB_APP_DEFINITIONS[id].label}: ${errorText(error)}` };
  }
}
