/**
 * `@midnite/studio-runtime` — the runtime layer (Phase 113, `docs/APPS.md`).
 *
 * Main-only: it may import `electron`, and nothing renderer-side may import
 * it. It holds the contract a feature's main half registers against and the
 * services every app shares (Theme D): the vault (`vault/`) and the pty
 * broker client (`broker/`), and the `midnite` CLI installer (`cli/`) and the
 * MCP tool listing per installed app (`mcp/`).
 */
export * from './feature-main';
export * from './window-events';
export * from './testing';
export * from './app-id';
export * from './data-directory';
export * from './vault';
export * from './broker';
export * from './cli';
export * from './mcp';
export * from './app-main';
