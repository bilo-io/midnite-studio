/**
 * `@midnite/studio-runtime` — the runtime layer (Phase 113, `docs/APPS.md`).
 *
 * Main-only: it may import `electron`, and nothing renderer-side may import
 * it. It holds the contract a feature's main half registers against and the
 * services every app shares (Theme D): the vault (`vault/`) and the pty
 * broker client (`broker/`), and the `midnite` CLI installer (`cli/`) and the
 * MCP tool listing per installed app (`mcp/`), and the crash-log sink every app's
 * main keeps (`log/`).
 */
export * from './feature-main';
export * from './window-events';
export * from './testing';
export * from './app-id';
export * from './data-directory';
export * from './host';
export * from './fs-jail';
export * from './fs-jail-write';
export * from './read-capped';
export * from './login-shell';
export * from './shell-path';
export * from './vault';
export * from './broker';
export * from './cli';
export * from './mcp';
export * from './agent-run';
export * from './app-main';
export * from './capture-output';
export * from './process-runner';
export * from './repo-skills';
export * from './media';
export * from './log';
export * from './menu';
export * from './security/findings-ledger';
