import { describe, expect, it } from 'vitest';

import { sniffStatementKind, splitStatements } from './statement-kind';

describe('sniffStatementKind', () => {
  it('classifies a plain SELECT as read', () => {
    expect(sniffStatementKind('SELECT * FROM users')).toBe('read');
  });

  it('classifies EXPLAIN as read', () => {
    expect(sniffStatementKind('EXPLAIN SELECT * FROM users')).toBe('read');
  });

  it.each(['UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'INSERT'])(
    'classifies %s as write',
    (verb) => {
      const sql: Record<string, string> = {
        UPDATE: "UPDATE users SET name = 'x' WHERE id = 1",
        DELETE: 'DELETE FROM users WHERE id = 1',
        DROP: 'DROP TABLE users',
        TRUNCATE: 'TRUNCATE TABLE users',
        ALTER: 'ALTER TABLE users ADD COLUMN x int',
        INSERT: "INSERT INTO users (name) VALUES ('x')",
      };
      expect(sniffStatementKind(sql[verb]!)).toBe('write');
    },
  );

  it('classifies a plain WITH … SELECT as read', () => {
    expect(sniffStatementKind('WITH recent AS (SELECT * FROM orders) SELECT * FROM recent')).toBe(
      'read',
    );
  });

  it('classifies WITH … DELETE as write — the must-not-fail case', () => {
    expect(
      sniffStatementKind('WITH x AS (SELECT id FROM orders WHERE stale) DELETE FROM y WHERE id IN (SELECT id FROM x)'),
    ).toBe('write');
  });

  it('classifies a data-modifying CTE as write even though the outer statement is SELECT', () => {
    expect(
      sniffStatementKind(
        'WITH deleted AS (DELETE FROM x RETURNING *) SELECT * FROM deleted',
      ),
    ).toBe('write');
  });

  it('handles RECURSIVE and multiple CTEs before the main statement', () => {
    expect(
      sniffStatementKind(
        'WITH RECURSIVE a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM a JOIN b ON true',
      ),
    ).toBe('read');
    expect(
      sniffStatementKind('WITH a AS (SELECT 1), b AS (SELECT 2) UPDATE t SET x = 1'),
    ).toBe('write');
  });

  it('ignores leading line and block comments', () => {
    expect(sniffStatementKind('-- a note\nSELECT 1')).toBe('read');
    expect(sniffStatementKind('/* a note */ SELECT 1')).toBe('read');
    expect(sniffStatementKind('/* note */ -- more\nDELETE FROM t')).toBe('write');
  });

  it('classifies multi-statement input as write if any statement is a write', () => {
    expect(sniffStatementKind('SELECT 1; SELECT 2;')).toBe('read');
    expect(sniffStatementKind("SELECT 1; DELETE FROM t;")).toBe('write');
  });

  it('does not split on a semicolon inside a string literal', () => {
    expect(sniffStatementKind("SELECT 'a;b'")).toBe('read');
  });

  it('does not split on a semicolon inside parentheses', () => {
    // A contrived but legal shape: nothing here actually contains a `;`
    // inside real SQL parens, but the splitter must not be fooled by one
    // appearing inside a nested quoted string within them.
    expect(sniffStatementKind("SELECT * FROM t WHERE x IN ('a;b', 'c')")).toBe('read');
  });

  it('classifies an empty/whitespace statement list as read', () => {
    expect(sniffStatementKind('  ')).toBe('read');
  });
});

describe('splitStatements', () => {
  it('splits on top-level semicolons only', () => {
    expect(splitStatements('SELECT 1; SELECT 2')).toHaveLength(2);
    expect(splitStatements("SELECT 'a;b'")).toHaveLength(1);
  });

  it('drops trailing empty statements from a terminating semicolon', () => {
    expect(splitStatements('SELECT 1;')).toHaveLength(1);
  });
});
