import { useCallback, useMemo, useState } from 'react';
import { LuBot } from 'react-icons/lu';
import { useQuery } from '@tanstack/react-query';

import type { ChatsHost } from '@midnite/studio-feature-chats/renderer';
import type { CouncilsHost } from '@midnite/studio-feature-councils/renderer';
import { useOllamaModels, useOllamaStatus, type ModelsHost } from '@midnite/studio-feature-models/renderer';
import { bridge } from '@midnite/studio-frame';
import { BUILTIN_AGENTS } from '@midnite/studio-shared';

import { AiComposer, AttachMenu, MultiSelectMenu, ProviderModelPicker, useComposerMic } from './plain-composer';
import { CodePreview, DiffView, MarkdownBody, Modal, Popover, Tooltip, UserAvatar } from './plain-ui';

/**
 * Agents' side of the three feature host ports (Phase 113 Theme N) — plain implementations over the
 * frame, with the terminal-, companion- and graph-backed members left out so the features drop those
 * affordances rather than render dead buttons.
 */

/** Window-local width/flag state, kept across launches in localStorage when it is there. */
function usePersistedNumber(key: string, initial: number): [number, (value: number) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(key));
      return Number.isFinite(stored) && stored > 0 ? stored : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: number) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // Private window or blocked storage: the width just does not persist.
      }
    },
    [key],
  );
  return [value, set];
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

export const AGENTS_MODELS_HOST = {
  Modal,
  CodePreview,
  useRepos: () => ({ data: [] }),
  openExternal,
  // No terminal (so no launch-with / `ollama serve` buttons) and no Settings view (so no settings link).
} satisfies ModelsHost;
