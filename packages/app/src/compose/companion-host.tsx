import type { CompanionSettings } from '@midnite/studio-shared';

import { useBrowserStore } from '@midnite/studio-feature-browser/renderer/store';
import { useGameRunStore } from '@midnite/studio-feature-media-game/renderer';
import { installCompanionHost, type CompanionHost, type RevealerTable } from '@midnite/studio-feature-companion/renderer';

import { AiComposer, AiThreadFrame, LevelMeterBars, ThinkingIndicator, useComposerMic } from '../components/ai-thread';
import { DialogHost, overlayDepth } from '../components/dialog-host';
import { PAGE_ROLE_TITLE } from '../components/page-detach-mark';
import { Tooltip } from '../components/tooltip';
import { dismissToast, showToast } from '../components/toast-host';
import { useDismissable } from '../components/use-dismissable';
import { UserAvatar } from '../components/user-avatar';
import { useAgentProbeStore } from '../features/agent/agent-probe-store';
import { skillHandoff } from '../features/agent/use-skill-handoff';
import { ExternalLink } from '../features/markdown/external-link';
import { COMMAND_ACCESS } from '../features/palette/safety';
import { LockScreenFintechWidget, LockScreenSysmonWidget } from '../features/screensaver/lock-screen-widgets';
import { applyPillDestination } from '../features/screensaver/pill-destinations';
import { useScreensaverReading } from '../features/screensaver/screensaver-stage';
import { startAgent } from '../features/terminal/start-agent';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { VIEW_KEYWORDS, VIEW_LABELS } from '../services/palette/providers';
import { AGENT_REVEALERS } from './companion/revealers/agent';
import { GIT_REVEALERS } from './companion/revealers/git';
import { NOTES_MEDIA_REVEALERS } from './companion/revealers/notes-media';
import { TOOLS_REVEALERS } from './companion/revealers/tools';
import { studioFollowUpReads } from './companion/follow-up-live';
import { DEFAULT_SOURCES } from './companion/sources';
import { useFileEditorStore } from '../store/file-editor-store';
import { openIssueModal } from '../store/issue-modal-store';
import { SETTINGS_PAGES, useUiStore, type PersistedUi } from '../store/ui-store';

/*
  The store's persisted companion keys and the shared slice schema must name the
  same settings. `CompanionSettingsSchema`'s own assertion ties the schema to
  the spec table; this one ties the store to the schema, so a `companion*` key
  added to `PersistedUi` without a spec fails here (it lived in the companion's
  `settings-apply.ts` until Phase 123 Theme F, when that left for a package that
  cannot see the store).
*/
type StoreCompanionKey = Extract<keyof PersistedUi, `companion${string}` | `voiceConversation${string}`>;
type AssertStoreMatchesSlice = [StoreCompanionKey] extends [keyof CompanionSettings]
  ? [keyof CompanionSettings] extends [StoreCompanionKey]
    ? true
    : never
  : never;
export const _assertStoreMatchesSlice: AssertStoreMatchesSlice = true;

/** Total over `ResourceKind`: a kind added to `ResourceRefSchema` with no Studio revealer fails typecheck here. */
const STUDIO_REVEALERS = { ...GIT_REVEALERS, ...AGENT_REVEALERS, ...NOTES_MEDIA_REVEALERS, ...TOOLS_REVEALERS } satisfies RevealerTable;

/**
 * Studio's side of the companion feature's host port (Phase 123 Theme F): the UI store, the reveal and
 * resolve tables written against Studio's own stores, the app's vocabulary and chrome.
 */
export const STUDIO_COMPANION_HOST: CompanionHost = {
  ui: useUiStore as unknown as CompanionHost['ui'],
  revealers: STUDIO_REVEALERS,
  sources: DEFAULT_SOURCES,
  followUp: studioFollowUpReads,
  catalog: {
    viewLabels: VIEW_LABELS,
    viewKeywords: VIEW_KEYWORDS,
    settingsPages: SETTINGS_PAGES,
    commandAccess: COMMAND_ACCESS,
  },
  gamePopped: () => useGameRunStore.getState().popped !== null,
  openBrowserUrl: (url) => useBrowserStore.getState().openTab(url),
  hasUnsavedFileNav: () => useFileEditorStore.getState().pendingNav !== null,
  openIssue: openIssueModal,
  pageRoleTitle: PAGE_ROLE_TITLE,
  overlayDepth,
  showToast,
  dismissToast,
  agentProbeStatus: () => useAgentProbeStore.getState().status,
  terminal: {
    store: useTerminalStore as unknown as CompanionHost['terminal']['store'],
    // Called through a closure so the host is built without touching either module's exports.
    startAgent: (input) => (startAgent as CompanionHost['terminal']['startAgent'])(input),
    skillHandoff: (options, context) => (skillHandoff as CompanionHost['terminal']['skillHandoff'])(options, context),
  },
  screensaver: {
    SysmonWidget: LockScreenSysmonWidget,
    FintechWidget: LockScreenFintechWidget,
    usePillCounts: () => useScreensaverReading().counts,
    applyPillDestination,
  },
  components: {
    AiComposer: AiComposer as CompanionHost['components']['AiComposer'],
    LevelMeterBars,
    AiThreadFrame,
    ThinkingIndicator,
    Tooltip,
    UserAvatar,
    ExternalLink,
    DialogHost,
  },
  hooks: { useComposerMic, useDismissable: useDismissable as CompanionHost['hooks']['useDismissable'] },
};

/*
  Installed at module load as well as by `CompanionHostProvider`: `App` and `DetachedRoot` call companion
  hooks in their own bodies, before the `StudioProviders` they render has mounted, and those read the host.
  Both composition roots import this module, so the host exists before the first render.
*/
installCompanionHost(STUDIO_COMPANION_HOST);
