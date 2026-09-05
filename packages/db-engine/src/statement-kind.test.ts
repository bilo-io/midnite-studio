import { describe, expect, it } from 'vitest';

import { sniffStatementKind, splitStatements } from './statement-kind';

/**
 * Smoke test only — proves the re-export from `@midnite/studio-shared`
 * actually wires up under `db-engine`'s own vitest alias. The full behavioural
 * suite (CTE handling, comments, multi-statement, quoting) now lives at
 * `packages/shared/src/domain/statement-kind.test.ts`, beside the
 * implementation.
 */
describe('statement-kind (re-export)', () => {
  it('classifies a plain SELECT as read', () => {
    expect(sniffStatementKind('SELECT * FROM users')).toBe('read');
  });

  it('classifies WITH … DELETE as write — the must-not-fail case', () => {
    expect(
      sniffStatementKind(
        'WITH x AS (SELECT id FROM orders WHERE stale) DELETE FROM y WHERE id IN (SELECT id FROM x)',
      ),
    ).toBe('write');
  });

  it('splits on top-level semicolons only', () => {
    expect(splitStatements('SELECT 1; SELECT 2')).toHaveLength(2);
  });
});
