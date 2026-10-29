import { cloneElement, useState } from 'react';
import { create } from 'zustand';

import { bridge } from '@midnite/studio-frame';
import { DEFAULT_COMPANION_VOLUME, PAGE_WINDOW_ROLES, type PageWindowRole, type ViewId } from '@midnite/studio-shared';

import type { CompanionHost, CompanionStore, CompanionTerminalState, CompanionUiState } from './host';

/**
 * The host an app gets when it composes no Studio views (Phase 123 Theme F). It lives here, beside the
 * port, not in the frame: the frame never imports a feature, and the type it fills is this feature's.
 *
 * - **Reveals** — every kind answers "I can't pick that out yet" (an empty `revealers` table), no
 *   source lists anything, and the follow-up reads find no selection.
 * - **Terminal** — an empty store; starting an agent returns nothing.
 * - **Preferences** — a local store seeded and kept in step with the suite-prefs file's `companion`
 *   group (`enabled`, the voice per engine and the STT provider), so the companion is switched on once
 *   and is on in every app, and a voice chosen in one is heard in all. Everything else is the
 *   defaults the persisted store would start from.
 * - **Chrome** — plain stand-ins (a textarea composer, a title-attribute tooltip, an anchor) a real
 *   app replaces with its own kit.
 */

export type DefaultCompanionHostOptions = {
  /** Where suite-prefs are read from; `bridge` when omitted. Injected by tests. */
  getBridge?: typeof bridge;
};

const VIEW_LABELS_FALLBACK = {} as Record<ViewId, string>;
const PAGE_TITLES = Object.fromEntries(PAGE_WINDOW_ROLES.map((role) => [role, role])) as Record<PageWindowRole, string>;

function createStore<S>(initial: (set: (partial: Partial<S> | ((state: S) => Partial<S>)) => void) => S): CompanionStore<S> {
  return create<S>()((set) => initial(set)) as unknown as CompanionStore<S>;
}

type UiSet = (partial: Partial<CompanionUiState> | ((state: CompanionUiState) => Partial<CompanionUiState>)) => void;

function initialUiState(set: UiSet): CompanionUiState {
  return {
    activeView: 'dashboard',
    settingsPage: 'appearance',
    selectedRepoId: null,
    graphSelection: null,
    quickAccessOpen: false,
    browserOpen: false,
    detachedPages: [],
    detachedWebApps: [],
    terminalDetached: false,
    reposDetached: false,
    fabDetached: false,
    companionDetached: false,
    browserDetached: false,
    screensaverLocked: false,
    primaryAgent: 'claude',
    primaryModelByAgent: {},
    agentSkills: {},
    projectBoardByRepo: {},
    forgeAccounts: [],
    forgeActiveAccountId: null,

    companionEnabled: false,
    companionPanelOpen: false,
    companionHandsFree: false,
    companionSpeakAloud: true,
    companionVolume: DEFAULT_COMPANION_VOLUME,
    companionMicMode: 'push',
    companionSttEngine: 'server',
    companionSttProvider: null,
    companionMusicOffer: true,
    companionNames: ['Companion'],
    companionHonorifics: [],
    companionPersonality: '',
    companionAboutUser: '',
    companionVoices: { system: null, local: null },
    companionProfiles: [],
    companionActiveProfile: null,
    voiceConversation: false,
    voiceConversationTrigger: 'always',

    setActiveView: (activeView) => set({ activeView }),
    setSettingsPage: (settingsPage) => set({ settingsPage }),
    selectRepo: (selectedRepoId) => set({ selectedRepoId }),
    setQuickAccessOpen: (quickAccessOpen) => set({ quickAccessOpen }),
    setBrowserOpen: (browserOpen) => set({ browserOpen }),
    setReposOpen: () => {},
    setTerminalOpen: () => {},
    setCompanionPanelOpen: (companionPanelOpen) => set({ companionPanelOpen }),
    toggleCompanionPanel: () => set((state) => ({ companionPanelOpen: !state.companionPanelOpen })),
    setPrimaryAgentAndModel: (primaryAgent, modelId = null) =>
      set((state) => ({ primaryAgent, primaryModelByAgent: { ...state.primaryModelByAgent, [primaryAgent]: modelId } })),
    setProjectBoard: (repoId, projectId) =>
      set((state) => ({ projectBoardByRepo: { ...state.projectBoardByRepo, [repoId]: projectId } })),
  };
}

/**
 * Keep the shared preferences and the local store in step: read the file once, follow other apps'
 * writes, and write this app's own changes back (one group, replaced whole).
 */
function followSuitePrefs(ui: CompanionStore<CompanionUiState>, getBridge: typeof bridge): void {
  const api = getBridge();
  if (!api?.suitePrefs) return;
  let applying = false;
  const apply = (companion: { enabled: boolean; voices: CompanionUiState['companionVoices']; sttEngine: CompanionUiState['companionSttEngine']; sttProvider: CompanionUiState['companionSttProvider'] }) => {
    applying = true;
    ui.setState({
      companionEnabled: companion.enabled,
      companionVoices: companion.voices,
      companionSttEngine: companion.sttEngine,
      companionSttProvider: companion.sttProvider,
    });
    applying = false;
  };
  void api.suitePrefs.get().then((snapshot) => apply(snapshot.prefs.companion));
  api.suitePrefs.onChanged((snapshot) => apply(snapshot.prefs.companion));
  ui.subscribe((state, previous) => {
    if (applying) return;
    if (
      state.companionEnabled === previous.companionEnabled &&
      state.companionVoices === previous.companionVoices &&
      state.companionSttEngine === previous.companionSttEngine &&
      state.companionSttProvider === previous.companionSttProvider
    ) {
      return;
    }
    void api.suitePrefs.set({
      key: 'companion',
      value: {
        enabled: state.companionEnabled,
        voices: state.companionVoices,
        sttEngine: state.companionSttEngine,
        sttProvider: state.companionSttProvider,
      },
    });
  });
}

export function createDefaultCompanionHost(options: DefaultCompanionHostOptions = {}): CompanionHost {
  const ui = createStore<CompanionUiState>(initialUiState);
  const terminalStore = createStore<CompanionTerminalState>(() => ({
    sessions: [],
    ptyIds: {},
    liveAgentId: {},
    activity: {},
    exitCodes: {},
  }));
  followSuitePrefs(ui, options.getBridge ?? bridge);

  return {
    ui,
    catalog: { viewLabels: VIEW_LABELS_FALLBACK, viewKeywords: VIEW_LABELS_FALLBACK, settingsPages: [], commandAccess: {} as CompanionHost['catalog']['commandAccess'] },
    revealers: {},
    sources: [],
    followUp: { selection: () => null, siblings: async () => null, related: async () => null },
    gamePopped: () => false,
    openBrowserUrl: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    hasUnsavedFileNav: () => false,
    openIssue: () => {},
    pageRoleTitle: PAGE_TITLES,
    overlayDepth: () => 0,
    showToast: () => null,
    dismissToast: () => {},
    agentProbeStatus: () => [],
    terminal: { store: terminalStore, startAgent: () => null, skillHandoff: () => null },
    screensaver: {
      SysmonWidget: () => null,
      FintechWidget: () => null,
      usePillCounts: () => ({ repos: 0, agents: 0, myPrs: 0, teamPrs: 0 }),
      applyPillDestination: () => {},
    },
    components: {
      AiComposer: ({ value, onChange, onSend, canSend, ariaLabel, placeholder, onKeyDown, textareaRef, leading, trailing, above, testIdPrefix = 'ai-composer' }) => (
        <div data-testid={`${testIdPrefix}-box`}>
          {above}
          <div className="flex items-end gap-1">
            {leading}
            <textarea
              ref={textareaRef}
              aria-label={ariaLabel}
              placeholder={placeholder}
              value={value}
              rows={1}
              onChange={(event) => onChange(event.target.value)}
              {...(onKeyDown ? { onKeyDown } : {})}
              data-testid={`${testIdPrefix}-input`}
              className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-xs outline-none"
            />
            {trailing}
            <button type="button" disabled={!canSend} onClick={onSend} data-testid={`${testIdPrefix}-send`}>
              Send
            </button>
          </div>
        </div>
      ),
      LevelMeterBars: () => null,
      AiThreadFrame: ({ loading, className, testId, children }) => (
        <div data-testid={testId} data-ai-loading={loading ? 'true' : 'false'} className={className}>
          {children}
        </div>
      ),
      ThinkingIndicator: ({ className }) => <div className={className}>Thinking…</div>,
      Tooltip: ({ label, children }) => cloneElement(children, { title: typeof label === 'string' ? label : undefined }),
      UserAvatar: ({ name }) => <span aria-hidden>{name.slice(0, 1).toUpperCase()}</span>,
      ExternalLink: ({ href, children, className }) => (
        <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
          {children}
        </a>
      ),
      DialogHost: ({ children }) => <>{children}</>,
    },
    hooks: {
      useComposerMic: () => {
        const [held] = useState(false);
        return { available: false, reason: 'Voice input is not set up in this app.', held, pressStart: () => {} };
      },
      useDismissable: () => null,
    },
  };
}
