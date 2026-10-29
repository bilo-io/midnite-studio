import type { ComponentType, ReactElement } from 'react';

import { FrameChromeProvider } from '@midnite/studio-frame';
import {
  LoopsHostProvider,
  setActiveLoopsHost,
  type LoopsExtrasComposerProps,
  type LoopsHost,
  type LoopsTerminalProps,
} from '@midnite/studio-feature-loops/renderer';

import { AiComposer, useComposerMic } from '../components/ai-thread';
import { resolveAgentIcon } from '../components/icons';
import { IconSelect, MultiIconSelect } from '../components/select/icon-select';
import { Tooltip } from '../components/tooltip';
import { useDismissable } from '../components/use-dismissable';
import { CompanionLauncher } from '../features/companion/companion-launcher';
import { COMPANION_LOOK, CompanionGlyph } from '../features/companion/companion-look';
import { companionPorts } from '../features/companion/companion-ports';
import { openNotes } from '../features/notes/notes-window';
import { useSetupStore } from '../features/setup/setup-store';
import { LazyTerminalView } from '../features/terminal/lazy-terminal-view';
import { startAgent } from '../features/terminal/start-agent';
import { agentInitialInput } from '../features/terminal/terminal-panel';
import { useTerminalStore } from '../features/terminal/terminal-store';
import { useAgents } from '../features/terminal/use-agents';
import { YieldedToSessionsPage } from '../features/terminal/yielded-to-sessions-page';
import { appendDictation } from '../features/media/voice/use-voice-thread';
import { useKnownSkills, useRepoStats, useRepos } from '../services/queries';
import { useCompanionStore } from '../store/companion-store';
import { useUiStore } from '../store/ui-store';
import { STUDIO_CHROME } from './studio-chrome';

/**
 * One loop's xterm, in Studio: the session's pending input (or the roster's
 * launch command) as its start input, and the Sessions page's placeholder when
 * that page's own live pane has claimed the session — one xterm per pty.
 */
function StudioLoopTerminal({ sessionId, active, fitSignal, layoutClassName }: LoopsTerminalProps) {
  const session = useTerminalStore((s) => s.sessions.find((row) => row.id === sessionId));
  const pendingInput = useTerminalStore((s) => s.pendingInput[sessionId]);
  const yielded = useTerminalStore((s) => s.sessionsPaneSessionId === sessionId);
  const agents = useAgents();
  if (!session) return null;
  if (yielded) return <YieldedToSessionsPage sessionId={sessionId} layoutClassName={layoutClassName} />;
  return (
    <LazyTerminalView
      key={session.id}
      session={session}
      active={active}
      initialInput={pendingInput ?? agentInitialInput(agents.agents, session.agentId)}
      fitSignal={fitSignal}
      {...(layoutClassName !== undefined ? { layoutClassName } : {})}
    />
  );
}

function StudioExtrasComposer({ value, onChange, ...rest }: LoopsExtrasComposerProps) {
  const mic = useComposerMic({ onTranscript: (text) => onChange(appendDictation(value, text)) });
  return <AiComposer value={value} onChange={onChange} mic={mic} {...rest} />;
}

/**
 * Studio's side of the loops feature's host port (Phase 123 Theme G): the loop
 * settings from `ui-store`, the terminal store and `startAgent`, the
 * companion, Notes and Setup behind the quick-access menu, and Studio's own
 * chrome. Nothing about how a loop is composed or run moved out of the feature.
 */
export const STUDIO_LOOPS_HOST = {
  appId: 'studio',
  useLoopsState: (selector) => useUiStore(selector),
  loopsState: () => useUiStore.getState(),
  useTerminal: (selector) => useTerminalStore(selector),
  terminalState: () => useTerminalStore.getState(),
  // `async` so a synchronous throw from `startAgent` is a rejection the caller can handle.
  startAgent: async ({ extraArgs, ...input }) =>
    startAgent({ ...input, ...(extraArgs !== undefined ? { extraArgs: [...extraArgs] } : {}) }).id,
  renderTerminal: (props) => <StudioLoopTerminal {...props} />,
  renderCompanionLauncher: () => <CompanionLauncher />,
  companion: {
    useStatus: () => {
      const enabled = useUiStore((s) => s.companionEnabled);
      const state = useCompanionStore((s) => s.state);
      const lastText = useCompanionStore(
        (s) => [...s.transcript].reverse().find((turn) => turn.role === 'companion')?.text ?? null,
      );
      return { enabled, state, lastText };
    },
    open: () => useUiStore.getState().setCompanionPanelOpen(true),
    repeat: () => companionPorts().repeat(),
    Glyph: CompanionGlyph,
    look: COMPANION_LOOK,
  },
  openNotes: () => openNotes(),
  setupStore: {
    useIncomplete: () => useUiStore((s) => s.setupState.completedAt === null),
    resume: () => useSetupStore.getState().resumeSetup(),
    open: () => useSetupStore.getState().openSetup(),
  },
  useAgents: () => useAgents(),
  useRepos: () => useRepos(),
  useKnownSkills: (repoId, enabled) => useKnownSkills(repoId, enabled),
  useContributors: (repoId, enabled) => {
    const stats = useRepoStats(repoId, 'all', false, enabled);
    return { data: stats.data?.contributors };
  },
  Tooltip,
  IconSelect,
  MultiIconSelect,
  ExtrasComposer: StudioExtrasComposer,
  resolveAgentIcon,
  // Escape, an outside press, focus leaving, Tab and the window losing focus all close it.
  useDismissable: ({ open, surfaceRef, trigger, onDismiss }) => {
    useDismissable({
      open,
      surfaceRef,
      trigger,
      layer: 'popover',
      tab: 'close',
      windowBlur: true,
      onDismiss: () => onDismiss(),
    });
  },
} satisfies LoopsHost;

/*
  Several loops hooks run outside any tree Studio could wrap in a provider —
  the app root's attention hook, the lock screen, Settings' loop rows — so the
  host is installed here, at import, and every `features/loops/*` shim imports
  this module.
*/
setActiveLoopsHost(STUDIO_LOOPS_HOST);

/**
 * Binds a loops component to Studio's host and chrome. The old
 * `features/loops/*` paths re-export their components through this, so every
 * existing render site keeps working with no provider of its own.
 */
export function withStudioLoopsHost<P extends object>(
  Component: ComponentType<P>,
): ((props: P) => ReactElement) & { displayName?: string } {
  function StudioLoopsHosted(props: P) {
    return (
      <FrameChromeProvider chrome={STUDIO_CHROME}>
        <LoopsHostProvider host={STUDIO_LOOPS_HOST}>
          <Component {...props} />
        </LoopsHostProvider>
      </FrameChromeProvider>
    );
  }
  StudioLoopsHosted.displayName = `StudioLoopsHosted(${Component.displayName ?? Component.name})`;
  return StudioLoopsHosted;
}
