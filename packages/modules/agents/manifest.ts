import { defineModuleManifest } from '@midnite/studio-shared';

/**
 * The Agents module (Phase 124 Theme E): the agents host's own features as a module, so every app is uniformly a
 * list of modules. Pure data both halves read: it imports `@midnite/studio-shared` and nothing else.
 */
export const agentsManifest = defineModuleManifest({
  module: 'agents',
  label: 'Agents',
  glyph: 'PiRobotFill',
  accent: '#8b5cf6',
  // Placement folders (`FEATURE_PLACEMENT` keys). The MCP server's Tools view (`mcp-tools`) is a package out of
  // the `agent` folder that this host also composes; it has no folder of its own to list.
  features: ['chats', 'councils', 'workflows', 'models'],
  views: [
    { id: 'chats', global: false },
    { id: 'councils', global: false },
    { id: 'workflows', global: false },
    { id: 'models', global: false },
  ],
});

export type AgentsManifest = typeof agentsManifest;
