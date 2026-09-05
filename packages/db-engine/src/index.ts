/**
 * @midnite/studio-db-engine — everything that touches a database connection,
 * as plain Node/TS (Phase 61).
 *
 * Dependency rule: no `electron` imports anywhere in this package, mirroring
 * `git-engine`'s own rule — it runs inside the Electron main process in
 * production, but stays runnable under bare vitest so drivers, pooling and
 * the statement sniffer are testable without a browser or an Electron binary.
 *
 * `src/testing/` is deliberately absent from this barrel, exactly as
 * `git-engine`'s `src/testing/temp-repo.ts` is — it is a test-only helper,
 * not part of the package's public surface.
 */
export const DB_ENGINE_VERSION = '0.1.0' as const;

export * from './connection-pool';
export * from './driver';
export * from './driver-for';
export * from './introspect';
export * from './normalize';
export * from './statement-kind';
