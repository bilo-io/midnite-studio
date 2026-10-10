import { useEffect } from 'react';

import {
  COMMANDS,
  COMPANION_MCP_CONFIRM_MS,
  COMPANION_SETTING_KEYS,
  companionSettingReadBack,
  companionSettingSpec,
  failure,
  isCompanionLocalVoiceId,
  ok,
  type CommandId,
  type CompanionSettingKey,
  type CompanionSettingsSetOutput,
  type CompanionUiAction,
  type CompanionUiReplyResult,
  type CompanionUiRequest,
  type PanelWindowRole,
  type WindowRole,
} from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { useCompanionStore } from '../../store/companion-store';
import { useToastStore } from '../../store/toast-store';
import { useUiStore } from '../../store/ui-store';
import { useGameRunStore } from '../media/game/game-run-store';
import { useFileEditorStore } from '../../store/file-editor-store';
import { openIssueModal } from '../../store/issue-modal-store';
import { VIEW_LABELS } from '../../services/palette/providers';
import { COMMAND_ACCESS } from '../palette/safety';
import { runCommand } from './command-runtime';
import { resolveNavigation, SETTINGS_PAGE_LABEL, type NavigationState } from './navigate';
import { askToConfirmMcpSetting } from './mcp-setting-confirm';
import {
  applyCompanionSetting,
  previewCompanionSetting,
  readCompanionSetting,
  type CompanionSettingApplied,
  type CompanionSettingRefused,
} from './settings-apply';
import { loadCompanionVoices } from './speaker';

/**
 * The main window's side of the ui.* MCP tools (Phase 81 Theme F) — the
 * renderer half of `main/companion/ui-bridge.ts`'s request/reply.
 *
 * `useCompanionUiRequests()` is mounted unconditionally from `app.tsx`; the
 * `windowRole === 'main'` check lives *inside* it, not at the call site —
 * `ui-bridge.ts` only ever targets `getMainWindow()`, so a popout's own copy
 * of this hook would never receive a request anyway, but the guardrail ("every
 * action executes in the main window") is enforced here too rather than
 * trusted to main alone.
 *
 * Every request runs through the SAME `resolveNavigation`/`runCommand` path
 * Themes B and C wired for the companion's own spoken sentences — an agent
 * gets no wider a door than a person talking to the companion, and a
 * `confirm`-tier command, a `never`-tier command, and a locked screen are
 * refused here for the identical reason they are refused there. The one
 * difference is that a steer is never silent even when nobody is looking at
 * the companion panel: every successful action posts a toast, and — only
 * when `companionEnabled` — a line in the companion's own transcript, so a
 * later "what did that agent just do" has an answer in two places.
 */
export function useCompanionUiRequests(): void {
  useEffect(() => {
    if ((bridge()?.windowRole ?? 'main') !== 'main') return undefined;

    const unsubscribe = bridge()?.companion.onUiRequest((req: CompanionUiRequest) => {
      void handleUiRequest(req);
    });
    return () => unsubscribe?.();
  }, []);
}

async function handleUiRequest(req: CompanionUiRequest): Promise<void> {
  const result = await resolveUiAction(req.action);
  bridge()?.companion.uiReply({ id: req.id, result });
}

/** Exported for `ui-requests.test.ts` — resolves one action without the request/reply envelope around it, since a test asserts on the outcome, not the wire shape. */
export async function resolveUiAction(action: CompanionUiAction): Promise<CompanionUiReplyResult> {
  if (action.kind === 'state') return ok(await buildStateReply());

  // Phase 109 Theme D's three arms answer before the lock check below: the
  // reads answer while locked, as `state` does, and the setter refuses a
  // locked write itself — as a `refused` status an agent can read, rather
  // than a bare failure.
  if (action.kind === 'settingsState') return ok(buildSettingsStateReply());
  if (action.kind === 'voices') return ok(await buildVoicesReply());
  if (action.kind === 'setting') return ok(await resolveSettingAction(action));

  // Both write actions share the lock check — a misheard sentence and an
  // unattended agent are the identical hazard while the screen is locked.
  if (useUiStore.getState().screensaverLocked) {
    return failure('The screen is locked — unlock it first.');
  }

  return action.kind === 'navigate' ? resolveNavigateAction(action) : resolveCommandAction(action);
}

// --- ui.state ----------------------------------------------------------------

const PANEL_ROLES: readonly PanelWindowRole[] = [
  'terminal',
  'repos',
  'fab',
  'companion',
  'browser',
  'apps-spotify',
  'apps-google-calendar',
  'apps-youtube',
  'game',
];

async function buildStateReply(): Promise<Extract<CompanionUiReplyResult, { ok: true }>['value']> {
  const ui = useUiStore.getState();
  const panelDetached: Record<PanelWindowRole, boolean> = {
    terminal: ui.terminalDetached,
    repos: ui.reposDetached,
    fab: ui.fabDetached,
    companion: ui.companionDetached,
    browser: ui.browserDetached,
    // The apps-rail roles track detached-ness as an array (`detachedApps`,
    // Theme D), mirroring `detachedPages` — see its own doc.
    'apps-spotify': ui.detachedApps.includes('spotify'),
    'apps-google-calendar': ui.detachedApps.includes('google-calendar'),
    'apps-youtube': ui.detachedApps.includes('youtube'),
    // A popped-out game (Phase 107 Theme B) — tracked by the Games tab's run store.
    game: useGameRunStore.getState().popped !== null,
  };
  const detached: WindowRole[] = [
    ...ui.detachedPages,
    ...PANEL_ROLES.filter((role) => panelDetached[role]),
  ];

  return {
    did: 'state',
    activeView: ui.activeView,
    settingsPage: ui.activeView === 'settings' ? ui.settingsPage : null,
    detached,
    repoPath: await selectedRepoPath(),
    locked: ui.screensaverLocked,
  };
}

async function selectedRepoPath(): Promise<string | null> {
  const api = bridge();
  const selected = useUiStore.getState().selectedRepoId;
  if (!selected || !api) return null;
  const repos = await api.repos.list();
  const repo = repos.find((entry) => entry.id === selected);
  if (!repo) return null;
  const main = repo.worktrees.find((worktree) => worktree.isMain);
  return main?.path ?? repo.path;
}

// --- ui.navigate ---------------------------------------------------------------

function resolveNavigateAction(
  action: Extract<CompanionUiAction, { kind: 'navigate' }>,
): CompanionUiReplyResult {
  const ui = useUiStore.getState();
  const state: NavigationState = {
    windowRole: 'main',
    detachedPages: ui.detachedPages,
    panelDetached: {
      terminal: ui.terminalDetached,
      repos: ui.reposDetached,
      fab: ui.fabDetached,
      companion: ui.companionDetached,
      browser: ui.browserDetached,
      // See `navigate.ts`'s identical note.
      'apps-spotify': ui.detachedApps.includes('spotify'),
      'apps-google-calendar': ui.detachedApps.includes('google-calendar'),
      'apps-youtube': ui.detachedApps.includes('youtube'),
      // A popped-out game (Phase 107 Theme B) — tracked by the Games tab's run store.
      game: useGameRunStore.getState().popped !== null,
    },
    locked: ui.screensaverLocked,
    repoId: ui.selectedRepoId,
  };

  const plan = resolveNavigation(
    {
      kind: 'navigate',
      view: action.view,
      ...(action.page === undefined ? {} : { page: action.page }),
      ...(action.issue === undefined ? {} : { issue: action.issue }),
    },
    state,
  );

  switch (plan.kind) {
    case 'refused':
      return failure(
        plan.reason === 'locked'
          ? 'The screen is locked — unlock it first.'
          : plan.reason === 'unknown-issue-repo'
            ? 'No repository is open to find that issue in.'
            : "That isn't a place I can go.",
      );

    // `resolveNavigation` only returns `relay` for a non-main window — this
    // hook never runs in one (the guardrail above), so this is unreachable
    // in practice; answered rather than left to throw regardless.
    case 'relay':
      return failure('This window cannot navigate.');

    // `ui.navigate`'s own input has no `url` field — `resolveNavigation`
    // never produces this plan from an action built here.
    case 'url':
      return failure('A URL is not a navigable view.');

    case 'focus-window': {
      bridge()?.window.focusRole({ role: plan.role });
      announce(`Agent: focused ${plan.title}.`, `An agent brought the ${plan.title} forward.`);
      return ok({ did: 'focused-window', view: action.view });
    }

    case 'view': {
      useUiStore.getState().setActiveView(plan.view);

      // Same guardrail Theme B's spoken path takes: an unsaved editor buffer
      // defers the whole action behind the save/discard dialog, and this
      // path touches nothing further either — the companion never answers a
      // dialog, and neither does an agent steering through it.
      if (useFileEditorStore.getState().pendingNav !== null) {
        return failure("There's an unsaved file — resolve that dialog first.");
      }

      if (plan.page !== undefined) useUiStore.getState().setSettingsPage(plan.page);
      if (plan.issue !== undefined && state.repoId !== null) {
        openIssueModal({ repoId: state.repoId, number: plan.issue });
      }

      // Announced unconditionally — unlike the companion's own spoken
      // "you're already on the {view}" (Theme B), a steer is never silent
      // even when the view did not change: the tool call still happened,
      // and the agent (and the toast) both need to know it landed rather
      // than being refused.
      const label = plan.page !== undefined ? SETTINGS_PAGE_LABEL[plan.page] : VIEW_LABELS[plan.view];
      announce(`Agent: opened ${label}.`, `An agent opened the ${label}.`);
      return ok({ did: 'navigated', view: action.view });
    }
  }
}

// --- ui.command ------------------------------------------------------------

const COMMAND_LABEL: Record<CommandId, string> = Object.fromEntries(
  COMMANDS.map((command) => [command.id, command.label]),
) as Record<CommandId, string>;

/** `ui.command`'s own refusal for anything that is not `direct` tier — the exact sentence `handoff.ts`'s `run` arm speaks for the identical reason. */
const NEEDS_THE_USER_MESSAGE = 'needs the user — ask them to run it from the palette';

function resolveCommandAction(action: Extract<CompanionUiAction, { kind: 'command' }>): CompanionUiReplyResult {
  const id = action.id as CommandId;
  if (COMMAND_ACCESS[id] !== 'direct') return failure(NEEDS_THE_USER_MESSAGE);

  const result = runCommand(id);
  if (!result.ok) return failure(result.message);

  const label = COMMAND_LABEL[id] ?? id;
  announce(`Agent: ran ${label}.`, `An agent ran ${label}.`);
  return ok({ did: 'ran', label });
}

// --- companion_settings_* and companion_voices_list (Phase 109 Theme D) ----------

type SettingReply = Extract<CompanionUiReplyResult, { ok: true }>['value'];

function buildSettingsStateReply(): SettingReply {
  const ui = useUiStore.getState();
  const values = Object.fromEntries(
    COMPANION_SETTING_KEYS.map((key) => [key, readCompanionSetting(ui, key)]),
  ) as Record<CompanionSettingKey, unknown>;
  return { did: 'settingsState', values, locked: ui.screensaverLocked };
}

async function buildVoicesReply(): Promise<SettingReply> {
  const voices = await loadCompanionVoices();
  const { companionVoices } = useUiStore.getState();
  return {
    did: 'voices',
    system: voices.map((voice) => ({
      voiceURI: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      default: voice.default,
    })),
    selected: {
      local: isCompanionLocalVoiceId(companionVoices.local) ? companionVoices.local : null,
      system: companionVoices.system,
    },
  };
}

function settingAnswer(
  status: CompanionSettingsSetOutput['status'],
  result: CompanionSettingApplied | CompanionSettingRefused,
): SettingReply {
  if (!result.ok) {
    return { did: 'setting', status: 'refused', key: result.key, reason: result.reason, message: result.message };
  }
  return { did: 'setting', status, key: result.key, previous: result.previous, next: result.next };
}

/**
 * `companion_settings_set` — B's setter with `source: 'mcp'`, which enforces
 * the tier itself. A `direct` change applies at once. A `confirm` one comes
 * back refused for want of a yes; it is previewed as if confirmed first, so a
 * change the guards or the value schema would refuse anyway is refused without
 * asking anyone, and then the user is asked (Decision 3). Only an approval
 * inside the deadline writes it.
 */
async function resolveSettingAction(action: Extract<CompanionUiAction, { kind: 'setting' }>): Promise<SettingReply> {
  const change = { key: action.key, value: action.value };
  const first = applyCompanionSetting(change, 'mcp');
  if (first.ok) {
    announceSetting(first);
    return settingAnswer('applied', first);
  }
  if (first.reason !== 'confirm') return settingAnswer('refused', first);

  const preview = previewCompanionSetting({ ...change, confirmed: true }, 'mcp');
  if (!preview.ok) return settingAnswer('refused', preview);

  const answer = await askToConfirmMcpSetting({
    key: preview.key,
    previous: preview.previous,
    next: preview.next,
    deadline: Date.now() + COMPANION_MCP_CONFIRM_MS,
  });
  if (answer !== 'approved') return { did: 'setting', status: answer, key: action.key };

  // Checked again, not trusted from the preview: the screen may have locked,
  // or the value moved, while the question was open.
  const applied = applyCompanionSetting({ ...change, confirmed: true }, 'mcp');
  if (!applied.ok) return settingAnswer('refused', applied);
  announceSetting(applied);
  return settingAnswer('approved', applied);
}

/** An agent's change is never silent: the toast and transcript line every steer gets. Theme E's spoken read-back with Undo replaces this. */
function announceSetting(result: CompanionSettingApplied): void {
  const label = companionSettingSpec(result.key).label;
  announce(
    `Agent: changed ${label}.`,
    `Your agent changed my ${label.toLowerCase()}. ${companionSettingReadBack(result.key, result.next)}`,
  );
}

// --- making a steer visible --------------------------------------------------

/** A steer is never silent (Theme F's own rule): always a toast, and a companion turn only when there is a companion to read it. */
function announce(toastMessage: string, companionText: string): void {
  useToastStore.getState().addToast({ message: toastMessage, status: 'info' });
  if (useUiStore.getState().companionEnabled) {
    useCompanionStore.getState().addTurn({ role: 'companion', text: companionText, spoken: false });
  }
}
