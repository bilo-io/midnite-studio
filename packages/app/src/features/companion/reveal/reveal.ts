import {
  resourceRefLabel,
  resourceRefRepoId,
  type ResourceKind,
  type ResourceRef,
  type ResourceRefOf,
  type ViewId,
  type WindowRole,
} from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';
import { useFileEditorStore } from '../../../store/file-editor-store';
import { useUiStore } from '../../../store/ui-store';
import {
  liveNavigationState,
  relayIntentToMain,
  resolveNavigation,
  type NavigationState,
} from '../navigate';
import { REVEALERS } from './revealers';
import { useRevealHistory } from './reveal-history';
import type { RevealFailure, RevealOptions, RevealOutcome, Revealer, RevealerTable } from './types';

export type { RevealCaller, RevealOptions, RevealOutcome, RevealFailure } from './types';

/**
 * Phase 112 Theme B — `revealResource`, the one engine every "open that
 * thing" goes through: the companion's spoken `navigate { target }`, an MCP
 * agent's `reveal` action and (Theme I) the `midnite-studio://reveal` link.
 *
 * A plain function over `getState()` and `bridge()`, like the rest of the
 * companion (`runtime.ts` says why: a turn outlives the render that started
 * it). The plan reuses Phase 81's rules unchanged, in this order:
 *
 *   1. a popout relays the reveal to the main window and reports its answer;
 *   2. a locked screen refuses;
 *   3. a repo-scoped ref whose repo is not selected switches repo first (the
 *      `use-model-agent-events.ts` order) — an unknown repo is `no-repo`;
 *   4. the revealer's view goes through `resolveNavigation`: a detached page
 *      is focused rather than duplicated (its selection follows through the
 *      broadcast-sync relay), otherwise `setActiveView` runs inside
 *      `guardNavigation`, and a blocked guard is `blocked-unsaved` with
 *      nothing selected;
 *   5. the revealer selects; a success is recorded in `lastRevealed`.
 *
 * Reveal only shows — no revealer plays, runs, checks out, sends or edits.
 */

/** The seams `revealResource` reads and drives — live by default, faked in `reveal.test.ts`. */
export type RevealDeps = {
  navigationState: () => NavigationState;
  hasRepo: (repoId: string) => Promise<boolean>;
  selectRepo: (repoId: string) => void;
  setActiveView: (view: ViewId) => void;
  /** True while the unsaved-file guard is holding a navigation behind its dialog. */
  unsavedPending: () => boolean;
  focusRole: (role: WindowRole) => void;
  relayToMain: (ref: ResourceRef) => Promise<RevealOutcome>;
  record: (ref: ResourceRef) => void;
  revealers: RevealerTable;
};

const LOCKED_SAY = 'The screen is locked — unlock it first.';
const UNSAVED_SAY = "There's an unsaved file — the dialog is asking what to do with it.";

const fail = (reason: RevealFailure, say: string): RevealOutcome => ({ ok: false, reason, say });

function revealerFor<K extends ResourceKind>(table: RevealerTable, ref: ResourceRefOf<K>): Revealer<K> {
  // The table is total over `ResourceKind`, indexed by the ref's own kind.
  return table[ref.kind] as unknown as Revealer<K>;
}

function viewFor<K extends ResourceKind>(revealer: Revealer<K>, ref: ResourceRefOf<K>): ViewId | null {
  return typeof revealer.view === 'function' ? revealer.view(ref) : revealer.view;
}

export async function revealResource(
  ref: ResourceRef,
  opts: RevealOptions,
  deps: RevealDeps = liveRevealDeps(),
): Promise<RevealOutcome> {
  const state = deps.navigationState();
  if (state.windowRole !== 'main') return deps.relayToMain(ref);
  if (state.locked) return fail('locked', LOCKED_SAY);

  const repoId = resourceRefRepoId(ref);
  if (repoId !== null && repoId !== state.repoId) {
    if (!(await deps.hasRepo(repoId))) {
      return fail('no-repo', `That ${ref.kind === 'media' ? ref.media : 'one'} is in a repository that isn't open.`);
    }
    deps.selectRepo(repoId);
    if (deps.unsavedPending()) return fail('blocked-unsaved', UNSAVED_SAY);
  }

  const revealer = revealerFor(deps.revealers, ref);
  const view = viewFor(revealer, ref);
  let focusedWindow = false;

  if (view !== null) {
    const plan = resolveNavigation({ kind: 'navigate', view }, { ...state, repoId: repoId ?? state.repoId });
    switch (plan.kind) {
      case 'focus-window':
        deps.focusRole(plan.role);
        focusedWindow = true;
        break;
      case 'view':
        deps.setActiveView(plan.view);
        if (deps.unsavedPending()) return fail('blocked-unsaved', UNSAVED_SAY);
        break;
      // `relay`/`locked` were answered above; `url`/`no-target`/issue cannot
      // come from a plan built with a view and nothing else.
      default:
        return fail('unavailable', "I'm not sure where that is.");
    }
  }

  const outcome = await revealer.reveal(ref, { ...opts, focusedWindow });
  if (!outcome.ok) return outcome;
  deps.record(ref);
  return focusedWindow && outcome.did === 'revealed' ? { ...outcome, did: 'focused-window' } : outcome;
}

/** The sentence a reveal outcome is spoken as — a revealer's own `say` wins, else "Here's {label}." */
export function revealSay(outcome: RevealOutcome): string {
  if (!outcome.ok) return outcome.say;
  if (outcome.say !== undefined) return outcome.say;
  return outcome.did === 'focused-window'
    ? `${capitalise(outcome.label)} is in its own window — bringing it forward.`
    : `Here's ${outcome.label}.`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const RELAY_REASONS: ReadonlySet<string> = new Set<RevealFailure>([
  'locked',
  'not-found',
  'no-repo',
  'blocked-unsaved',
  'unavailable',
]);

/** The live wiring — every store and bridge call the engine makes, in one place. */
export function liveRevealDeps(): RevealDeps {
  return {
    navigationState: liveNavigationState,
    hasRepo: async (repoId) => {
      try {
        return ((await bridge()?.repos.list()) ?? []).some((repo) => repo.id === repoId);
      } catch {
        return false;
      }
    },
    selectRepo: (repoId) => useUiStore.getState().selectRepo(repoId),
    setActiveView: (view) => useUiStore.getState().setActiveView(view),
    unsavedPending: () => useFileEditorStore.getState().pendingNav !== null,
    focusRole: (role) => bridge()?.window.focusRole({ role }),
    relayToMain: async (ref) => {
      const result = await relayIntentToMain({ kind: 'navigate', target: ref });
      if (result.ok) return { ok: true, did: 'relayed', label: resourceRefLabel(ref), say: result.say };
      const reason = result.reason !== undefined && RELAY_REASONS.has(result.reason) ? result.reason : 'unavailable';
      return fail(reason as RevealFailure, result.say);
    },
    record: (ref) => useRevealHistory.getState().record(ref),
    revealers: REVEALERS,
  };
}
