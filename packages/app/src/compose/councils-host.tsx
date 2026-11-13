import type { CouncilsHost } from '@midnite/studio-feature-councils/renderer';

import { AiComposer, ProviderModelPicker } from '../components/ai-thread';
import { resolveAgentIcon } from '../components/icons';
import { useOccluder } from '../components/use-occluder';
import { MarkdownBody } from '../features/markdown/markdown-body';
import { MEDIA_PROMPT_BOX } from '../features/media/prompt-input';
import { useAgents } from '../features/terminal/use-agents';
import { openExternal } from '../services/queries';
import { DEFAULT_LAYOUT, LAYOUT_BOUNDS, useUiStore } from '../store/ui-store';

/**
 * Studio's side of the councils feature's host port (Phase 113 Theme N).
 *
 * The pane widths and the config pane's collapsed flag stay in `ui-store`
 * (`layout.councilNavWidth`, `layout.councilConfigWidth`,
 * `councilConfigCollapsed`), so moving the feature into a package changed no
 * stored key, and the occluder count is the one the embedded browser watches.
 * The AI-thread kit (Phase 133) is the same set the Chats host installs.
 */
export const STUDIO_COUNCILS_HOST = {
  useLayout: () => {
    const layout = useUiStore((s) => s.layout);
    const setLayout = useUiStore((s) => s.setLayout);
    const configCollapsed = useUiStore((s) => s.councilConfigCollapsed);
    const setConfigCollapsed = useUiStore((s) => s.setCouncilConfigCollapsed);
    return {
      nav: {
        size: layout.councilNavWidth,
        setSize: (value: number) => setLayout('councilNavWidth', value),
        initial: DEFAULT_LAYOUT.councilNavWidth,
        ...LAYOUT_BOUNDS.councilNavWidth,
      },
      config: {
        size: layout.councilConfigWidth,
        setSize: (value: number) => setLayout('councilConfigWidth', value),
        initial: DEFAULT_LAYOUT.councilConfigWidth,
        ...LAYOUT_BOUNDS.councilConfigWidth,
      },
      configCollapsed,
      setConfigCollapsed,
    };
  },
  useOccluder,
  AiComposer,
  composerBoxClassName: MEDIA_PROMPT_BOX,
  ProviderModelPicker,
  MarkdownBody,
  useAgentRoster: () => useAgents(),
  resolveAgentIcon,
  openExternal,
} satisfies CouncilsHost;
