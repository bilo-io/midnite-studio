import { chatsManifest } from '@midnite/studio-feature-chats/renderer';
import { councilsManifest } from '@midnite/studio-feature-councils/renderer';
import { modelsManifest } from '@midnite/studio-feature-models/renderer';
import { workflowsManifest } from '@midnite/studio-feature-workflows/renderer';

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
  views: ['chats', 'councils', 'workflows', 'models', 'tools'],
} as const;

export type AgentsApp = typeof AGENTS_APP;
