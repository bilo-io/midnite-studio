import type { StatementKind } from './database';

/**
 * The `StatementKind` sniffer — shared by Theme I's confirm gate
 * (`packages/app/src/features/database/statement-confirm.ts`) and Theme H's
 * editability checks.
 *
 * Lives in `shared`, not `db-engine`, even though Theme B originally built it
 * there: the renderer's destructive-statement gate needs this exact
 * classifier, and `packages/app` may not import `@midnite/studio-db-engine`
 * (see `eslint.config.mjs`'s db-engine boundary block — "the renderer must
 * reach the DB only over IPC"). The function itself is pure string
 * classification with no I/O and no driver dependency, so it belongs beside
 * `StatementKind` in `shared`, which both `db-engine` and `app` may import.
 * `db-engine/src/statement-kind.ts` re-exports this module verbatim so its
 * own drivers and tests keep the same import path.
 *
 * Only `SELECT` and `EXPLAIN` are `'read'`. Everything else is `'write'` —
 * the fail-safe default the phase doc's scope guardrail states directly:
 * "Non-`SELECT` statements are gated behind a confirm dialog." An unrecognised
 * or malformed statement therefore prompts rather than executing silently.
 *
 * The one case that must not be wrong: `WITH x AS (SELECT …) DELETE FROM y`
 * classifies as `'write'` even though its first keyword is `WITH` — naive
 * prefix matching would read only as far as `WITH` and miss the `DELETE`
 * entirely. This sniffer walks past the CTE list to find the statement that
 * actually runs.
 *
 * It also catches the mirror case some providers allow — a **data-modifying
 * CTE**, where the write sits *inside* a CTE's own body and a plain `SELECT`
 * reads its result (`WITH deleted AS (DELETE FROM x RETURNING *) SELECT *
 * FROM deleted`). The phase doc does not name this case, but the same
 * "must not be wrong" reasoning applies to it, so any CTE body whose own
 * first keyword is not a read marks the whole statement `'write'`.
 */

const READ_KEYWORDS = new Set(['SELECT', 'EXPLAIN']);

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch);
}

/** Advance past whitespace, `--` line comments and `/* … *‍/` block comments. */
function skipTrivia(sql: string, start: number): number {
  let i = start;
  for (;;) {
    while (i < sql.length && isSpace(sql[i])) i++;
    if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

/** Read one bare (unquoted) identifier/keyword token, upper-cased. */
function readWord(sql: string, start: number): { word: string; end: number } {
  let i = start;
  while (i < sql.length && isWordChar(sql[i])) i++;
  return { word: sql.slice(start, i).toUpperCase(), end: i };
}

/**
 * Skip a balanced `(...)` starting exactly at the opening paren, respecting
 * quoted strings and comments inside it. Returns the index just past the
 * matching `)`, or `sql.length` if it is never closed (malformed input; the
 * caller's fail-safe default still applies to whatever comes after).
 */
function skipParens(sql: string, openParenIndex: number): number {
  let depth = 0;
  let i = openParenIndex;
  let inSingle = false;
  let inDouble = false;
  while (i < sql.length) {
    const ch = sql[i];
    if (inSingle) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i++;
      continue;
    }
    if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === '(') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')') {
      depth--;
      i++;
      if (depth === 0) return i;
      continue;
    }
    i++;
  }
  return i;
}

/**
 * Split on top-level `;` only — never inside a quoted string, a comment, or
 * parentheses (a CTE's own body routinely contains semicolon-free SQL, but
 * this stays defensive about nested subqueries all the same).
 */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let start = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (inSingle) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        inSingle = false;
      }
      i++;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i++;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i++;
      continue;
    }
    if (sql.startsWith('--', i)) {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (ch === '(') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      i++;
      continue;
    }
    if (ch === ';' && depth === 0) {
      statements.push(sql.slice(start, i));
      i++;
      start = i;
      continue;
    }
    i++;
  }
  const last = sql.slice(start);
  if (last.trim().length > 0) statements.push(last);
  return statements.filter((s) => s.trim().length > 0);
}

/** Classify exactly one statement (no top-level `;` inside it). */
function classifyOne(sql: string): StatementKind {
  let i = skipTrivia(sql, 0);
  const first = readWord(sql, i);
  let keyword = first.word;
  const end = first.end;

  if (keyword === 'WITH') {
    i = skipTrivia(sql, end);
    const maybeRecursive = readWord(sql, i);
    if (maybeRecursive.word === 'RECURSIVE') {
      i = skipTrivia(sql, maybeRecursive.end);
    }

    let dataModifyingCte = false;

    for (;;) {
      // CTE name (a bare identifier only — a quoted one bails out below,
      // which still resolves safely: the eventual keyword read finds a
      // quote character, matches no read keyword, and classifies 'write').
      const name = readWord(sql, i);
      if (name.word.length === 0) break;
      i = skipTrivia(sql, name.end);

      // Optional column list: `cte_name (col1, col2) AS (...)`.
      if (sql[i] === '(') {
        i = skipTrivia(sql, skipParens(sql, i));
      }

      const asKeyword = readWord(sql, i);
      if (asKeyword.word !== 'AS') break; // Not the shape this parses; fall through.
      i = skipTrivia(sql, asKeyword.end);

      // Optional `MATERIALIZED` / `NOT MATERIALIZED` (Postgres 12+).
      if (sql[i] !== '(') {
        const modifier = readWord(sql, i);
        if (modifier.word.length > 0) i = skipTrivia(sql, modifier.end);
      }
      if (sql[i] !== '(') break; // Malformed; fall through to the fail-safe default.

      const bodyStart = i;
      const bodyEnd = skipParens(sql, bodyStart);
      const bodyInnerStart = skipTrivia(sql, bodyStart + 1);
      const bodyKeyword = readWord(sql, bodyInnerStart).word;
      if (!READ_KEYWORDS.has(bodyKeyword)) dataModifyingCte = true;

      i = skipTrivia(sql, bodyEnd);
      if (sql[i] === ',') {
        i = skipTrivia(sql, i + 1);
        continue;
      }
      break;
    }

    if (dataModifyingCte) return 'write';

    const main = readWord(sql, i);
    keyword = main.word;
  }

  return READ_KEYWORDS.has(keyword) ? 'read' : 'write';
}

/**
 * Classify a (possibly multi-statement) SQL string.
 *
 * Multi-statement input (`a; b;`) classifies as `'write'` if **any**
 * statement is a write — the confirm gate has to fire if it would run
 * anything destructive, not only if the first statement is.
 */
export function sniffStatementKind(sql: string): StatementKind {
  const statements = splitStatements(sql);
  if (statements.length === 0) return 'read';
  return statements.some((s) => classifyOne(s) === 'write') ? 'write' : 'read';
}
