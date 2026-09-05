/**
 * @midnite/studio-git-engine — everything that touches git, as plain Node/TS.
 *
 * Dependency rule: no `electron` imports anywhere in this package. It runs
 * inside the Electron main process in production, but it must stay runnable
 * under bare vitest so parsers, layout and commands are testable without a
 * browser or an Electron binary.
 */
export const GIT_ENGINE_VERSION = '0.1.0' as const;

export * from './commands';
export * from './exec/fs-activity';
export * from './exec/git-exec';
export * from './exec/write-queue';
export * from './layout';
export * from './parsers';
export * from './stats';
export * from './testing';
export * from './tests';
export * from './watch';
