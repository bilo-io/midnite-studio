/**
 * `@midnite/studio-runtime` — the runtime layer (Phase 113, `docs/APPS.md`).
 *
 * Main-only: it may import `electron`, and nothing renderer-side may import
 * it. It holds the contract a feature's main half registers against and the
 * services every app shares (Theme D): the vault (`vault/`) and the pty
 * broker client (`broker/`). The `midnite` CLI and MCP server follow.
 */
export * from './feature-main';
export * from './window-events';
export * from './testing';
export * from './app-id';
export * from './vault';
export * from './broker';
