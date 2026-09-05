/**
 * The `StatementKind` sniffer, re-exported from `@midnite/studio-shared`.
 *
 * Moved there during Phase 61 Theme I: `packages/app`'s destructive-statement
 * confirm gate needs this exact classifier, and the renderer may not import
 * `@midnite/studio-db-engine` (`eslint.config.mjs`'s db-engine boundary block
 * — "the renderer must reach the DB only over IPC"). The sniffer is pure
 * string classification with no I/O, so `shared` — importable by both
 * `db-engine` and `app` — is where it belongs. This file stays so
 * `db-engine`'s own drivers and `./statement-kind.test.ts` keep the same
 * import path; the implementation and its full test coverage now live at
 * `packages/shared/src/domain/statement-kind.ts`.
 */
export { sniffStatementKind, splitStatements } from '@midnite/studio-shared';
