import { frameContent, frameTailwindPreset } from '../../packages/frame/tailwind-preset';

import type { Config } from 'tailwindcss';

/**
 * Agents' Tailwind config: the frame's preset plus the globs of what this build
 * compiles from source (the frame and the three features) and its own src.
 */
const config: Config = {
  presets: [frameTailwindPreset],
  content: frameContent(
    __dirname,
    ['chats', 'councils', 'models', 'workflows', 'mcp-tools', 'forge', 'tests', 'api-client', 'database', 'sessions', 'tasks', 'media-core', 'media-docs', 'media-images', 'media-video', 'media-audio', 'slides'],
    ['agents', 'coder', 'creator'],
  ),
};

export default config;
