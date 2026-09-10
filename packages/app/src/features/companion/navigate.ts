import {
  PAGE_WINDOW_ROLES,
  type CompanionIntent,
  type PageWindowRole,
  type PanelWindowRole,
  type SettingsPageId,
  type ViewId,
  type WindowRole,
} from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { useBrowserStore } from '../../store/browser-store';
import { useFileEditorStore } from '../../store/file-editor-store';
import { SETTINGS_PAGES, useUiStore } from '../../store/ui-store';
import { useIssuesStore } from '../../store/issues-store';
import { PAGE_ROLE_TITLE } from '../../components/page-detach-mark';
import { VIEW_LABELS } from '../../services/palette/providers';

/**
 * Phase 81 Theme B — "take me to the graph," and the window that is already
 * out.
 *
 * Two halves, deliberately split. {@link resolveNavigation} is pure: given an
 * intent and a snapshot of the state that decides its outcome, it says what
 * *should* happen, never touching a store or the bridge — which is what makes
 * it directly unit-testable, one case per branch. {@link navigateCompanion} is
 * the impure other half `HandoffDeps.navigate` is wired to: it reads the live
 * stores and `bridge()`, calls the pure resolver, and executes whatever it
 * decided — the same "plain functions over `getState()` and `bridge()`"
 * shape every other file in this feature takes, for the reason `runtime.ts`
 * gives (a companion turn outlives the render that started it).
 */

export type NavigationState = {
  windowRole: WindowRole;
  detachedPages: readonly PageWindowRole[];
  panelDetached: Record<PanelWindowRole, boolean>;
  locked: boolean;
  /** The currently-selected repository, or `null` when none is open. */
  repoId: string | null;
};

/**
 * What a `navigate` intent resolves to, before anything runs.
 *
 * **Deviation from the phase doc's own shorthand type:** a fifth kind, `url`,
 * carries the one target that is not a `ViewId` (Theme B's own "the browser
 * is a panel, not a view" rule). Folding it into `focus-window` instead — the
 * doc's Acceptance bullet reads that way — would break `focus-window`'s own
 * contract that a plan executes and "nothing else": a URL still has to open
 * in the browser *even when the panel was already detached and got focused*,
 * which `focus-window`'s other caller (a page role) must never do. A
 * dedicated kind keeps that "and nothing else" rule true for every
 * `focus-window` plan rather than making it true for some and not others.
 */
export type NavigationPlan =
  | { kind: 'view'; view: ViewId; page?: SettingsPageId; issue?: number }
  | { kind: 'focus-window'; role: WindowRole; title: string }
  | { kind: 'relay' }
  | { kind: 'refused'; reason: 'locked' | 'unknown-issue-repo' | 'no-target' }
  | { kind: 'url'; url: string; focusFirst: boolean };

/**
 * Decide what a `navigate` intent means, without doing it.
 *
 * Order matters and is the acceptance list verbatim: a popout relays before
 * anything else is considered (Finding 4 — the trap is the companion's own
 * window); a locked screen refuses next (Decision, Not in this phase); a URL
 * target is resolved against the browser panel's own detached flag; an issue
 * number with no repo open refuses by name; a detached page focuses its
 * window instead of opening a second copy; everything else is an ordinary
 * view (with its optional settings page / issue riding along).
 */
export function resolveNavigation(
  intent: Extract<CompanionIntent, { kind: 'navigate' }>,
  state: NavigationState,
): NavigationPlan {
  if (state.windowRole !== 'main') return { kind: 'relay' };
  if (state.locked) return { kind: 'refused', reason: 'locked' };

  if (intent.url !== undefined) {
    return { kind: 'url', url: intent.url, focusFirst: state.panelDetached.browser };
  }

  if (intent.view === undefined) return { kind: 'refused', reason: 'no-target' };

  if (intent.issue !== undefined && state.repoId === null) {
    return { kind: 'refused', reason: 'unknown-issue-repo' };
  }

  if (isPageRoleView(intent.view) && state.detachedPages.includes(intent.view)) {
    return { kind: 'focus-window', role: intent.view, title: PAGE_ROLE_TITLE[intent.view] };
  }

  return {
    kind: 'view',
    view: intent.view,
    ...(intent.page === undefined ? {} : { page: intent.page }),
    ...(intent.issue === undefined ? {} : { issue: intent.issue }),
  };
}

/**
 * `isPageWindowRole` (shared) is typed over `WindowRole`, not `ViewId` — the
 * two unions overlap but neither contains the other (`ViewId` alone has
 * `landing`/`councils`/`workflows`/`video`/`apiClient`/`settings`), so it
 * cannot narrow `intent.view` here. This is the same membership test, typed
 * for the union this function actually holds.
 */
const PAGE_ROLE_SET: ReadonlySet<string> = new Set(PAGE_WINDOW_ROLES);
function isPageRoleView(view: ViewId): view is PageWindowRole {
  return PAGE_ROLE_SET.has(view);
}

/** Exported for `ui-requests.ts` (Phase 81 Theme F) — the MCP-steered path announces the same label a spoken navigation does, rather than a second lookup. */
export const SETTINGS_PAGE_LABEL: Record<SettingsPageId, string> = Object.fromEntries(
  SETTINGS_PAGES.map((page) => [page.id, page.label]),
) as Record<SettingsPageId, string>;

/** The host, never the whole URL — Phase 80 Theme A's spoken-form rule. */
function speakableHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/**
 * Execute one `navigate` intent in the CURRENT window and say what happened.
 *
 * Reads everything it needs from live stores and `bridge()` — no parameters
 * beyond the intent itself, matching `resolveNavigation`'s `state.repoId`
 * against whatever this window's own `ui-store` currently holds. That is
 * correct for both callers: a popout never gets past `resolveNavigation`'s
 * `relay` branch (so `repoId` is never even read there), and the main
 * window's own selection is what a relayed action is meant to act against
 * anyway — it already travels cross-window on the existing `ui` relay kind,
 * so there is nothing to thread through a second time.
 */
export async function navigateCompanion(
  intent: Extract<CompanionIntent, { kind: 'navigate' }>,
): Promise<{ say: string }> {
  const api = bridge();
  const ui = useUiStore.getState();
  const state: NavigationState = {
    windowRole: api?.windowRole ?? 'main',
    detachedPages: ui.detachedPages,
    panelDetached: {
      terminal: ui.terminalDetached,
      repos: ui.reposDetached,
      fab: ui.fabDetached,
      companion: ui.companionDetached,
      browser: ui.browserDetached,
    },
    locked: ui.screensaverLocked,
    repoId: ui.selectedRepoId,
  };

  const plan = resolveNavigation(intent, state);

  switch (plan.kind) {
    case 'relay':
      return { say: await relayNavigateToMain(intent) };

    case 'refused':
      return {
        say:
          plan.reason === 'locked'
            ? 'The screen is locked — unlock it first.'
            : plan.reason === 'unknown-issue-repo'
              ? `Open a repository and I'll find issue ${intent.issue ?? ''}.`
              : "I'm not sure where that is.",
      };

    case 'focus-window':
      api?.window.focusRole({ role: plan.role });
      return { say: `The ${plan.title} is in its own window — bringing it forward.` };

    case 'url': {
      const host = speakableHost(plan.url);
      if (plan.focusFirst) api?.window.focusRole({ role: 'browser' });
      else useUiStore.getState().setBrowserOpen(true);
      useBrowserStore.getState().openTab(plan.url);
      return { say: `Opening ${host}.` };
    }

    case 'view': {
      const before = useUiStore.getState().activeView;
      useUiStore.getState().setActiveView(plan.view);

      // The unsaved-file guard (`guardNavigation`) defers the whole action
      // behind the save/discard dialog rather than running it — Theme B
      // touches nothing further and says so, exactly as a click on the same
      // view link would leave things.
      if (useFileEditorStore.getState().pendingNav !== null) {
        return { say: "There's an unsaved file — the dialog is asking what to do with it." };
      }

      if (plan.page !== undefined) {
        useUiStore.getState().setSettingsPage(plan.page);
        return { say: `Settings — ${SETTINGS_PAGE_LABEL[plan.page]}.` };
      }

      if (plan.issue !== undefined && state.repoId !== null) {
        useIssuesStore.getState().selectIssue(state.repoId, plan.issue);
      }

      const label = VIEW_LABELS[plan.view];
      return {
        say: before === plan.view ? `You're already on the ${label}.` : `Here's the ${label}.`,
      };
    }
  }
}

// --- the popout↔main relay ---------------------------------------------------

/**
 * Pending relay requests this window is waiting on, keyed by the id it sent.
 *
 * Module-level rather than per-call: `bridge().window.onRelayed` fires
 * whatever is currently subscribed, and a popout only ever has one companion
 * flow in flight at a time (the same "one controller" rule `runtime.ts`
 * enforces), so one map, subscribed once, is all this ever needs to hold.
 */
const pendingRelays = new Map<string, (say: string) => void>();
let relayListenerBound = false;

function ensureRelayListenerBound(): void {
  if (relayListenerBound) return;
  relayListenerBound = true;
  bridge()?.window.onRelayed((message) => {
    if (message.kind !== 'companion') return;
    const payload = message.payload as { result?: { ok: boolean; say: string }; replyTo?: string };
    if (payload.replyTo === undefined || payload.result === undefined) return;
    const resolve = pendingRelays.get(payload.replyTo);
    if (!resolve) return;
    pendingRelays.delete(payload.replyTo);
    resolve(payload.result.say);
  });
}

const RELAY_TIMEOUT_MS = 5_000;

const newRelayId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2);

/** A popout hands the intent to main and waits for what it said. */
function relayNavigateToMain(intent: Extract<CompanionIntent, { kind: 'navigate' }>): Promise<string> {
  const api = bridge();
  if (!api) return Promise.resolve('I cannot reach the main window from here.');
  ensureRelayListenerBound();

  const replyTo = newRelayId();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRelays.delete(replyTo);
      resolve('The main window did not answer.');
    }, RELAY_TIMEOUT_MS);
    pendingRelays.set(replyTo, (say) => {
      clearTimeout(timer);
      resolve(say);
    });
    api.window.relay({
      id: newRelayId(),
      origin: 'companion-navigate',
      kind: 'companion',
      payload: { action: intent, replyTo },
    });
  });
}

/**
 * The main window's other half of the relay — mounted from
 * `use-window-sync.ts` (main-window-only, same as every other reconciliation
 * that file owns). Runs the action through the identical `navigateCompanion`
 * a directly-typed sentence takes (its own `resolveNavigation` call this time
 * sees `windowRole === 'main'`, so it executes rather than relaying again —
 * no separate "am I the target" check needed) and relays the result back.
 *
 * Only `navigate` is handled: Theme B is the only theme wiring this
 * transport today, and Themes C/E's `run`/`confirm` arms do not (yet) relay
 * from a popout. An action of any other kind is answered `ok: false` rather
 * than silently dropped, so a future caller finds out rather than hanging
 * until the 5 s timeout.
 */
export function handleCompanionRelayAction(action: CompanionIntent, replyTo: string): void {
  const api = bridge();
  if (action.kind !== 'navigate') {
    api?.window.relay({
      id: newRelayId(),
      origin: 'main-companion-relay',
      kind: 'companion',
      payload: { result: { ok: false, say: '' }, replyTo },
    });
    return;
  }
  void navigateCompanion(action).then((outcome) => {
    api?.window.relay({
      id: newRelayId(),
      origin: 'main-companion-relay',
      kind: 'companion',
      payload: { result: { ok: true, say: outcome.say }, replyTo },
    });
  });
}
