/**
 * `@midnite/studio-runtime` — the runtime layer (Phase 113, `docs/APPS.md`).
 *
 * Main-only: it may import `electron`, and nothing renderer-side may import
 * it. Today it holds the contract a feature's main half registers against;
 * Theme D moves the services every app shares (the vault, the pty broker, the
 * `midnite` CLI and MCP server, the link router) in behind the same seam.
 */
export * from './feature-main';
export * from './window-events';
export * from './testing';
