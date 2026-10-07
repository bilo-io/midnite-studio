/**
 * @midnite/studio-shared — the single wire contract between the Electron main
 * process and the renderer. Zod schemas double as runtime validators (every IPC
 * handler parses its payload) and as the source of the TypeScript types.
 *
 * Dependency rule: this package imports zod and nothing else in the workspace.
 */
export const SHARED_CONTRACT_VERSION = '0.1.0' as const;

export * from './activity-palette';
export * from './agent-invocation';
export * from './ai-models';
export * from './ai-plan-blueprint';
export * from './ansi';
export * from './automate';
export * from './chats';
export * from './companion';
export * from './council';
export * from './domain';
export * from './fs';
export * from './git-identity';
export * from './install-command';
export * from './ipc';
export * from './keybindings';
export * from './loops';
export * from './markdown-image';
export * from './markets';
export * from './markets-portfolio';
export * from './mcp';
export * from './media';
export * from './game';
export * from './media-game';
export * from './media-game-templates';
export * from './media-model';
export * from './media-model-library';
export * from './media-model-mesh';
export * from './media-game-mcp';
export * from './media-model-mcp';
export * from './media-model-rig';
export * from './media-model-sdf';
export * from './media-model-pbr';
export * from './media-model-sf3d';
export * from './media-model-sf3d-licence';
export * from './media-sprite';
export * from './media-terrain';
export * from './media-terrain-mcp';
export * from './media-sprite-mcp';
export * from './model-geometry';
export * from './sprite';
export * from './terrain';
export * from './ollama';
export * from './ollama-catalogue';
export * from './ollama-launch';
export * from './perf';
export * from './process-env';
export * from './redact';
export * from './setup';
export * from './system-memory';
export * from './release';
export * from './terminal';
export * from './version';
export * from './video';
export * from './workflow';
export * from './workflow-cron';
export * from './workflow-receipt';
export * from './workflow-test-parsers';
export * from './workflow-templates';
