import { planHandoff, type HandoffRequest, type HandoffAppId } from '@midnite/studio-shared';

import { bridge } from '../bridge';

/**
 * A suite app's cross-app hand-off (Phase 113, `docs/APPS.md` "The shared data plane") — the
 * standalone counterpart of Studio's `services/handoff.ts`.
 *
 * The app names what it hosts; a request for anything else is planned `external` and its
 * `midnite://open` link goes to main (`handoff.open` on the bridge, `registerHandoffOpener` in
 * main), which hands it to the launcher's router: the installed app, else Studio, else the
 * launcher's detail sheet. A local request navigates in-process through the app's own `navigate`.
 */

export type AppHandoffOutcome =
  | { ok: true; via: 'local' | 'external' }
  | { ok: false; say: string };

export type AppHandoffDeps = {
  /** The apps this process hosts — usually just itself. */
  hosted: ReadonlySet<HandoffAppId>;
  /** In-process navigation for a hosted target; absent, a local request is refused. */
  navigate?: (request: HandoffRequest) => void;
  /** Opens a `midnite://` link; defaults to the bridge's `handoff.open`. */
  open?: (link: string) => Promise<boolean>;
};

const viaBridge = async (link: string): Promise<boolean> => {
  const handoff = bridge()?.handoff;
  if (!handoff) return false;
  try {
    return (await handoff.open({ link })).ok;
  } catch {
    return false;
  }
};

/** Plans and performs one hand-off. Never throws; a refusal carries a sentence the UI can show. */
export async function handOff(request: HandoffRequest, deps: AppHandoffDeps): Promise<AppHandoffOutcome> {
  const plan = planHandoff(request, deps.hosted);
  if (plan.kind === 'external') {
    if (await (deps.open ?? viaBridge)(plan.link)) return { ok: true, via: 'external' };
    return { ok: false, say: 'That opens in another app, and Midnite Apps could not be reached to open it.' };
  }
  if (!deps.navigate) return { ok: false, say: 'This app cannot open that here.' };
  deps.navigate(plan.request);
  return { ok: true, via: 'local' };
}
