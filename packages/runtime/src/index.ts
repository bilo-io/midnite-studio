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
export * from './private-files';
export * from './disk-redaction';
export * from './read-capped';
export * from './login-shell';
export * from './engine-key-env';
export * from './shell-path';
export * from './vault';
export * from './suite-prefs';
export * from './loop-runs';
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
export * from './security/agent-audit';
export * from './security/agent-breaker';
export * from './security/command-tracker';
export * from './security/injection-detector';
export * from './security/mcp-discovery';
export * from './security/mcp-poison';
export * from './security/mcp-trust';
export * from './security/canary';
export * from './security/tool-guard';
export * from './security/hook-call';
export * from './security/agent-env-check';
export * from './security/seatbelt-profile';
export * from './security/confine';
export * from './security/confine-denials';
export * from './security/confine-roots';
export * from './security/install-detector';
export * from './security/package-checker';
export * from './security/skills-audit';
export * from './security/install-checker';
export * from './guard';
export * from './net/guarded-fetch';
export * from './module-main';
