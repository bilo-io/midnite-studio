import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

import type { IconComponent } from '@midnite/studio-frame';
import type { AgentDefinition, AgentStatus } from '@midnite/studio-shared';

/**
 * The councils feature's host port — what this feature needs from the app that
 * composes it, beyond the frame (Phase 113 Theme N).
 *
 * Councils is almost self-contained: it draws on the frame's panel stack,
 * resizable panes and chrome port. What it cannot own is state that sits on the
 * app — how wide the nav and config panes are (persisted by the app's layout
 * store, so a user's widths survive the move), whether the config pane is
 * collapsed, and the occluder count that hides the embedded browser while a
 * dialog is open (a Studio-only concern; an app without a browser installs a
 * no-op).
 *
 * Phase 133 added the AI-thread kit Chats already takes from its host — the
 * composer, the provider/model picker, markdown, the agent roster and its
 * marks — so a council thread reads and is driven exactly like a chat. The
 * props below are the subset Councils passes; the Chats host's members satisfy
 * them, and Studio and Agents install the very same components.
 */

/** A persisted pane width: the stored size, how to store one, and its bounds. */
export type CouncilsPaneWidth = {
  size: number;
  setSize: (value: number) => void;
  initial: number;
  min: number;
  max: number;
};

export type CouncilsLayout = {
  nav: CouncilsPaneWidth;
  config: CouncilsPaneWidth;
  configCollapsed: boolean;
  setConfigCollapsed: (collapsed: boolean) => void;
};

export type CouncilsAiComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
  above?: ReactNode;
  sendTooltip?: string;
  streaming?: boolean;
  onStop?: () => void;
  testIdPrefix?: string;
  boxClassName?: string;
};

export type CouncilsPickerProvider = {
  id: string;
  label: string;
  icon: IconComponent;
  color?: string;
  disabled?: boolean;
  reason?: string;
};

export type CouncilsPickerModel = { id: string; label: string; recommended?: boolean };

export type CouncilsProviderModelPickerProps = {
  providers: readonly CouncilsPickerProvider[];
  provider: string;
  onProviderChange: (id: string) => void;
  models: readonly CouncilsPickerModel[];
  model: string;
  onModelChange: (id: string) => void;
  testId?: string;
};

export type CouncilsHost = {
  /** The persisted pane widths and the config pane's collapsed flag. A hook. */
  useLayout: () => CouncilsLayout;
  /** Registers an open overlay so a live embedded browser view hides beneath it. A hook. */
  useOccluder: (active?: boolean) => void;
  /** The shared AI composer (Chats' own). */
  AiComposer: ComponentType<CouncilsAiComposerProps>;
  /** The gradient-bordered wrapper class the composer's box wears. */
  composerBoxClassName: string;
  /** The provider + model picker (Chats' own). */
  ProviderModelPicker: ComponentType<CouncilsProviderModelPickerProps>;
  /** Markdown, for member answers and the synthesis. */
  MarkdownBody: ComponentType<{ content: string; className?: string }>;
  /** The agent roster and what main could learn about it on this machine. A hook. */
  useAgentRoster: () => { agents: AgentDefinition[]; status: AgentStatus[] };
  /** The glyph for an agent (its brand mark, or a fallback for an unknown one). */
  resolveAgentIcon: (agent: { id: string; icon?: string }) => IconComponent;
};

const CouncilsHostContext = createContext<CouncilsHost | null>(null);

export function CouncilsHostProvider({ host, children }: { host: CouncilsHost; children: ReactNode }) {
  return <CouncilsHostContext.Provider value={host}>{children}</CouncilsHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the panes would have no widths. */
export function useCouncilsHost(): CouncilsHost {
  const host = useContext(CouncilsHostContext);
  if (!host) throw new Error('The councils feature must be rendered inside <CouncilsHostProvider>');
  return host;
}
