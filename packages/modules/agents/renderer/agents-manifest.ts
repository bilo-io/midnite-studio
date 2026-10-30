import { chatsManifest } from '@midnite/studio-feature-chats/renderer';
import { councilsManifest } from '@midnite/studio-feature-councils/renderer';
import { modelsManifest } from '@midnite/studio-feature-models/renderer';
import { workflowsManifest } from '@midnite/studio-feature-workflows/renderer';
import { navFromModules, type NavConfig } from '@midnite/studio-frame';
import { LuBox, LuMessagesSquare, LuScrollText, LuUsers, LuWorkflow, LuWrench } from 'react-icons/lu';
import { APP_MODULES } from '@midnite/studio-shared';
import { PiRobotFill } from 'react-icons/pi';
import { agentsManifest } from '../manifest';

/**
 * The shell's rail (Phase 123 Theme B): the app's views, in its existing tab order. Settings is never
 * listed — `AppShell` puts it at the rail's foot. `panels` is absent, so the app carries every panel
 * (decision 12).
 */
const AGENTS_NAV: NavConfig = {
  views: [
    { id: 'chats', label: 'Chats', icon: LuMessagesSquare, command: 'view.chats' },
    { id: 'councils', label: 'Councils', icon: LuUsers },
    { id: 'workflows', label: 'Graphs', icon: LuWorkflow },
    { id: 'models', label: 'Models', icon: LuBox, command: 'view.models' },
    { id: 'tools', label: 'Tools', icon: LuWrench },
    { id: 'audit', label: 'Audit', icon: LuScrollText },
  ],
};

/**
 * The rail, derived from `APP_MODULES.agents` (Phase 124 Theme E.2): one titled group per module the host mounts,
 * this module's views beneath. Modules the host does not mount yet have no entry, so wiring one in (E.3) adds
 * its group here and nothing else.
 */
const AGENTS_HOST_NAV: NavConfig = navFromModules(APP_MODULES.agents, {
  agents: { id: 'agents', label: agentsManifest.label, icon: PiRobotFill, accent: agentsManifest.accent, views: AGENTS_NAV.views },
});

/**
 * Agents' app manifest — pure data (Phase 113 Theme N).
 *
 * `accent` matches the launcher catalog's `agents` tile; the glyph is the catalog's too
 * (`PiRobotFill`, rendered by the home view and baked into `resources/icon.icns` by
 * the launcher's `scripts/app-icons.cjs`). `home` is Chats; Councils, Graphs (workflows), Models and Tools (the MCP
 * server's Tools view, `mcp-tools`) sit beside it. `mcp-tools` is a package out of the `agent`
 * placement folder (`FEATURE_PACKAGE_SPLITS`), so it is named here by its package, not by a manifest's
 * folder.
 */
export const AGENTS_APP = {
  id: 'agents',
  name: 'Midnite Agents',
  tagline: 'Chats, councils, graphs and local models',
  accent: '#8b5cf6',
  home: 'chats',
  features: [chatsManifest.feature, councilsManifest.feature, workflowsManifest.feature, modelsManifest.feature, 'mcp-tools'],
  views: ['chats', 'councils', 'workflows', 'models', 'tools', 'audit'],
  nav: AGENTS_HOST_NAV,
} as const;

export type AgentsApp = typeof AGENTS_APP;
