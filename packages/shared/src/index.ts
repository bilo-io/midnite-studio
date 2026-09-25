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
export * from './companion';
export * from './council';
export * from './domain';
export * from './fs';
export * from './ipc';
export * from './keybindings';
export * from './loops';
export * from './mcp';
export * from './ollama';
export * from './ollama-launch';
export * from './perf';
export * from './process-env';
export * from './redact';
export * from './release';
export * from './terminal';
export * from './version';
export * from './video';
export * from './workflow';
export * from './workflow-cron';
export * from './workflow-test-parsers';
