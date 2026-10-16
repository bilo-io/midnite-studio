import { chatsManifest } from '@midnite/studio-feature-chats/renderer';
import { councilsManifest } from '@midnite/studio-feature-councils/renderer';
import { modelsManifest } from '@midnite/studio-feature-models/renderer';

/**
 * Agents' app manifest — pure data (Phase 113 Theme N).
 *
 * `accent` matches the launcher catalog's `agents` tile; the glyph is the catalog's too
 * (`PiRobotFill`, rendered by the home view and baked into `resources/icon.icns` by
 * `scripts/make-icon.mjs`). `home` is Chats; Councils and Models sit beside it. Graphs and Tools
 * (MCP) are the catalog's other two features and land in the next slice.
 */
export const AGENTS_APP = {
  id: 'agents',
  name: 'Midnite Agents',
  tagline: 'Chats, councils and local models',
  accent: '#8b5cf6',
  home: 'chats',
  features: [chatsManifest.feature, councilsManifest.feature, modelsManifest.feature],
  views: ['chats', 'councils', 'models'],
} as const;

export type AgentsApp = typeof AGENTS_APP;
