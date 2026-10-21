import type { IconComponent } from '@midnite/studio-frame';
import { createContext, useContext, useState, type ComponentType, type ReactNode } from 'react';

/**
 * The Model feature's host port (Phase 113 Theme S) — what Models needs from the app that composes it,
 * beyond the frame and the media kit.
 *
 * The prompt box with its engine picker, dictation and spoken outcome; the agent roster an iterative (MCP)
 * run picks from; the explorer's tree sections and their persisted open state; the SF3D consent modal; and
 * the editor toolbar's icon selects are all Studio's chrome (ai-thread, voice, the agents store, the dismiss
 * stack), and a feature may not import any of it — so each is a seam. Studio's adapter is
 * `packages/app/src/compose/media-model-host.tsx`.
 *
 * Everything is optional. An app that leaves a seam out gets the feature's plain version: a textarea and a
 * Generate button, Ollama as the only engine, a tree section that keeps its own open state, a simple dialog
 * and a native `<select>`. The provider keys never cross this port: generation runs in main.
 */

/** One agent of the roster, as the engine picker lists it. */
export type ModelAgent = { id: string; label: string; icon: IconComponent; accent?: string };

/** One row of the engine picker. */
export type ModelPickerProvider = {
  id: string;
  label: string;
  icon: IconComponent;
  /** Brand colour, applied while this row is the selected one. */
  color?: string;
  recommended?: boolean;
};

export type ModelComposerProps = {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  /** A dictated transcript to join onto the draft; the feature appends it. */
  onDictation: (text: string) => void;
  onSend: () => void;
  canSend: boolean;
  sendTooltip: string;
  sendAriaLabel: string;
  rows: number;
  placeholder: string;
  testIdPrefix: string;
  /** The engine dropdown beside the prompt. */
  picker: {
    testId: string;
    providers: readonly ModelPickerProvider[];
    provider: string;
    models: ReadonlyArray<{ id: string; label: string; recommended?: boolean }>;
    model: string;
    onProviderChange: (provider: string) => void;
    onModelChange: (model: string) => void;
  };
  /** The "+" menu's one entry: attach a picture. */
  attach: { testId: string; label: string; onSelect: () => void };
  /** What the host speaks when a job ends: `busy` falling to false says `error`, else `done`. */
  outcome: { busy: boolean; error: string | null; done: string };
};

export type ModelModalProps = { open: boolean; onClose: () => void; title: string; size?: 'sm' | 'md' | 'lg'; testId?: string; children: ReactNode };

export type ModelIconSelectOption = { value: string; label: string; icon: IconComponent; description?: string; disabled?: boolean };

export type ModelIconSelectProps = {
  options: readonly ModelIconSelectOption[];
  value: string;
  onChange: (next: string) => void;
  icon: IconComponent;
  label: string;
  description?: string;
};

export type ModelTreeSectionProps = {
  title: string;
  count?: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  hideWhenEmpty?: boolean;
  depth?: 0 | 1 | 2 | 3;
  tone?: 'primary';
  tinted?: boolean;
  children: ReactNode;
};

/** Which tree sections are collapsed, by key, and a way to flip one. A hook. */
export type ModelTreeCollapse = { collapsed: readonly string[]; toggle: (key: string) => void };

export type ModelHost = {
  /** The prompt box with its engine picker, mic and "+" menu. Absent → a plain textarea with a Generate button. */
  Composer?: ComponentType<ModelComposerProps>;
  /** The roster's agents (headless-capable or not — the feature filters) and the primary one's id. A hook. Absent → Ollama only. */
  useAgentRoster?: () => { agents: readonly ModelAgent[]; primaryAgent: string };
  /** The mark for an agent or provider id (a folder's `model.json` provider). Absent → the box glyph. */
  resolveAgentIcon?: (id: string) => IconComponent | undefined;
  /** The explorer's collapsible group header. Absent → a plain one. */
  TreeSection?: ComponentType<ModelTreeSectionProps>;
  /** Persisted open state for the tree. A hook. Absent → in-memory state, per mount. */
  useTreeCollapse?: () => ModelTreeCollapse;
  /** The SF3D licence dialog. Absent → a plain overlay dialog. */
  Modal?: ComponentType<ModelModalProps>;
  /** The editor toolbar's compact dropdown. Absent → a native `<select>`. */
  IconSelect?: ComponentType<ModelIconSelectProps>;
  /**
   * A read-only code view for `model.json` and any other `.json` in a model folder (Studio's is Monaco, which
   * is heavy and loads on first use, so the host supplies a lazy component). Absent → a plain `<pre>`.
   */
  JsonView?: ComponentType<{ text: string }>;
};

const ModelHostContext = createContext<ModelHost>({});

export function ModelHostProvider({ host, children }: { host: ModelHost; children: ReactNode }) {
  return <ModelHostContext.Provider value={host}>{children}</ModelHostContext.Provider>;
}

/** The installed host, or an empty one outside a provider — Models degrades to its plain version. */
export function useModelHost(): ModelHost {
  return useContext(ModelHostContext);
}

const NO_AGENTS: readonly ModelAgent[] = [];
const noRoster = () => ({ agents: NO_AGENTS, primaryAgent: '' });

/** The agents an engine can be picked from — the host's, else none. */
export function useAgentRoster(): { agents: readonly ModelAgent[]; primaryAgent: string } {
  return (useModelHost().useAgentRoster ?? noRoster)();
}

function useLocalTreeCollapse(): ModelTreeCollapse {
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);
  return { collapsed, toggle: (key) => setCollapsed((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key])) };
}

/** The tree's collapse state — the host's persisted one, else local to this mount. */
export function useTreeCollapse(): ModelTreeCollapse {
  return (useModelHost().useTreeCollapse ?? useLocalTreeCollapse)();
}
