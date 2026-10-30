import { useCallback, useEffect, useMemo, useState } from 'react';
import { LuBot } from 'react-icons/lu';
import { useQuery } from '@tanstack/react-query';

import type { ChatsHost } from '@midnite/studio-feature-chats/renderer';
import type { CouncilsHost } from '@midnite/studio-feature-councils/renderer';
import type { WorkflowsHost } from '@midnite/studio-feature-workflows/renderer';
import { useOllamaModels, useOllamaStatus, type ModelsHost } from '@midnite/studio-feature-models/renderer';
import { bridge } from '@midnite/studio-frame';
import { BUILTIN_AGENTS, ChatWidthModeSchema, DEFAULT_CHAT_WIDTH_MODE, type ChatWidthMode } from '@midnite/studio-shared';

import { AiComposer, AttachMenu, MultiSelectMenu, ProviderModelPicker, useComposerMic } from './plain-composer';
import { CodePreview, DiffView, MarkdownBody, Modal, Popover, Tooltip, TreeSection, UserAvatar } from './plain-ui';

/**
 * Agents' side of the three feature host ports (Phase 113 Theme N) — plain implementations over the
 * frame, with the terminal-, companion- and graph-backed members left out so the features drop those
 * affordances rather than render dead buttons.
 */

/**
 * Window-local state, kept across launches in localStorage when it is there.
 * `decode` reads what was stored (`null` when nothing was, or storage is
 * blocked) and `encode` writes the next value; the typed hooks below are the
 * one lifecycle with a codec each.
 */
function usePersisted<T>(key: string, decode: (stored: string | null) => T, encode: (value: T) => string): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return decode(window.localStorage.getItem(key));
    } catch {
      return decode(null);
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, encode(next));
      } catch {
        // Private window or blocked storage: the value just does not persist.
      }
    },
    [key, encode],
  );
  return [value, set];
}

const encodeNumber = (value: number): string => String(value);
const encodeFlag = (value: boolean): string => (value ? '1' : '0');
const encodeWidthMode = (mode: ChatWidthMode): string => mode;

/** A pane width: anything that is not a positive number reads as `initial`. */
function usePersistedNumber(key: string, initial: number): [number, (value: number) => void] {
  return usePersisted(
    key,
    (stored) => {
      const n = Number(stored);
      return Number.isFinite(n) && n > 0 ? n : initial;
    },
    encodeNumber,
  );
}

/** The thread width mode; an unknown stored value falls back to the default. */
function usePersistedWidthMode(key: string): [ChatWidthMode, (mode: ChatWidthMode) => void] {
  return usePersisted(
    key,
    (stored) => {
      const parsed = ChatWidthModeSchema.safeParse(stored);
      return parsed.success ? parsed.data : DEFAULT_CHAT_WIDTH_MODE;
    },
    encodeWidthMode,
  );
}

const openExternal = (url: string): void => {
  // Main's window-open handler sends https links to the system browser.
  window.open(url, '_blank', 'noopener');
};

const FALLBACK_ROSTER = { agents: [...BUILTIN_AGENTS], status: [] };

export const AGENTS_CHATS_HOST = {
  Modal,
  Popover,
  Tooltip,
  UserAvatar,
  MarkdownBody,
  DiffView,
  MultiSelectMenu,
  AiComposer,
  AttachMenu,
  ProviderModelPicker,
  composerBoxClassName: 'rounded-md border border-input',
  useComposerMic,
  // No repository registry yet: every chat runs in its scratch directory (see main/context.ts).
  useRepos: () => ({ data: [] }),
  useSelectedRepoId: () => null,
  useListWidth: () => {
    const [size, setSize] = usePersistedNumber('midnite-agents.chatsListWidth', 280);
    return { size, setSize, initial: 280, min: 200, max: 420 };
  },
  useThreadWidth: () => {
    const [mode, setMode] = usePersistedWidthMode('midnite-agents.chatsWidthMode');
    return { mode, setMode };
  },
  useAgentRoster: () => {
    const query = useQuery({
      queryKey: ['agents'],
      queryFn: async () => (await bridge()?.agent.list()) ?? { ...FALLBACK_ROSTER, probe: 'unknown' as const },
    });
    return useMemo(() => ({ agents: query.data?.agents ?? FALLBACK_ROSTER.agents, status: query.data?.status ?? FALLBACK_ROSTER.status }), [query.data]);
  },
  usePrimaryAgent: () => 'claude',
  useLocalModels: () => {
    const status = useOllamaStatus();
    const models = useOllamaModels();
    const names = useMemo(() => (models.data ?? []).map((m) => m.name), [models.data]);
    return { reachable: status.data?.reachable === true, models: names };
  },
  useAccount: () => undefined,
  resolveAgentIcon: () => LuBot,
} satisfies ChatsHost;

export const AGENTS_COUNCILS_HOST = {
  useLayout: () => {
    const [navSize, setNavSize] = usePersistedNumber('midnite-agents.councilNavWidth', 260);
    const [configSize, setConfigSize] = usePersistedNumber('midnite-agents.councilConfigWidth', 320);
    const [collapsed, setCollapsed] = useState(false);
    return {
      nav: { size: navSize, setSize: setNavSize, initial: 260, min: 200, max: 420 },
      config: { size: configSize, setSize: setConfigSize, initial: 320, min: 240, max: 480 },
      configCollapsed: collapsed,
      setConfigCollapsed: setCollapsed,
    };
  },
  // No embedded browser view to hide beneath an overlay.
  useOccluder: () => undefined,
} satisfies CouncilsHost;

/** A boolean, the same way: `initial` until something was stored. */
function usePersistedFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  return usePersisted(key, (stored) => (stored === null ? initial : stored === '1'), encodeFlag);
}

const NO_NODE_SESSIONS: ReadonlyMap<string, never[]> = new Map();

/**
 * Sizes and bounds are Studio's own (`ui-store`'s `DEFAULT_LAYOUT`/`LAYOUT_BOUNDS`), so a graph reads the
 * same in both apps. A run's node sessions are none: Agents has no terminal, so the canvas shows each
 * node's run state alone.
 */
export const AGENTS_WORKFLOWS_HOST = {
  Modal,
  Popover,
  MultiSelectMenu,
  TreeSection,
  useDismiss: (active, onDismiss) => {
    useEffect(() => {
      if (!active) return undefined;
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') onDismiss();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [active, onDismiss]);
  },
  useLayout: () => {
    const [list, setList] = usePersistedNumber('midnite-agents.workflowListWidth', 224);
    const [detail, setDetail] = usePersistedNumber('midnite-agents.workflowDetailWidth', 320);
    const [runPanel, setRunPanel] = usePersistedNumber('midnite-agents.workflowRunPanelHeight', 220);
    const [paletteCollapsed, setPaletteCollapsed] = usePersistedFlag('midnite-agents.workflowPaletteCollapsed', false);
    const [runPanelCollapsed, setRunPanelCollapsed] = usePersistedFlag('midnite-agents.workflowRunPanelCollapsed', false);
    // Re-derived from the selection on every change, so it is not worth persisting.
    const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
    return {
      list: { size: list, setSize: setList, initial: 224, min: 180, max: 480 },
      detail: { size: detail, setSize: setDetail, initial: 320, min: 260, max: 600 },
      runPanel: { size: runPanel, setSize: setRunPanel, initial: 220, min: 120, max: 480 },
      paletteWidth: 216,
      paletteCollapsed,
      setPaletteCollapsed,
      runPanelCollapsed,
      setRunPanelCollapsed,
      inspectorCollapsed,
      setInspectorCollapsed,
    };
  },
  useNodeSessions: () => NO_NODE_SESSIONS,
} satisfies WorkflowsHost;

export const AGENTS_MODELS_HOST = {
  Modal,
  CodePreview,
  useRepos: () => ({ data: [] }),
  openExternal,
  // No terminal (so no launch-with / `ollama serve` buttons) and no Settings view (so no settings link).
} satisfies ModelsHost;
