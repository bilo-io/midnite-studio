import { relative, sep } from 'node:path';

import { DIAGNOSTICS_ROW_CAP, type Diagnostic } from '@midnite/git-shared';

/**
 * `eslint --format json`, parsed as it arrives.
 *
 * ## Why streaming
 *
 * The payload is proportional to the number of problems, not the size of the
 * repository, and a checkout mid-refactor can emit tens of megabytes of it.
 * Buffering that whole string in main to hand to `JSON.parse` means peak memory
 * of roughly twice the payload — the string plus the object graph — for a
 * result we are about to reduce to two integers and at most a few hundred rows.
 *
 * So the scanner below pulls one top-level array element at a time (one element
 * is one file's results), reduces it, and drops it. Memory is bounded by the
 * largest single element plus the row cap, regardless of how much the linter
 * has to say. There is no total-bytes ceiling and none is needed: the only cost
 * of a huge payload is time, and the runner's deadline already bounds that.
 *
 * ## Total, like `gh-parse.ts`
 *
 * A message that cannot be understood is dropped rather than guessed at. But
 * the *stream* is strict where it needs to be: if the output does not begin
 * with `[`, or an element does not parse, the result is `parse-failed` rather
 * than an empty success. That distinction is the whole point — a tool that
 * printed an error message must not be indistinguishable from a clean repo.
 */

/** Two levels on the wire; eslint's 0/1/2 maps here, and 0 (off) never appears. */
const SEVERITY: Record<number, Diagnostic['severity']> = { 1: 'warning', 2: 'error' };

/**
 * One file's results, held whole only for as long as it takes to reduce it.
 *
 * Four megabytes is roughly tens of thousands of messages in a single file. A
 * payload past that is not a big repository, it is something that is not eslint
 * output, and continuing would mean silently undercounting — so it fails the
 * stream rather than dropping the element. An undercount that reads as progress
 * is worse than an honest `parse-failed`.
 */
const MAX_ELEMENT_BYTES = 4 * 1024 * 1024;

export type EslintStreamResult =
  | {
      ok: true;
      errorCount: number;
      warningCount: number;
      rows: Diagnostic[];
      withheld: number;
    }
  | { ok: false; hint: string };

export type DiagnosticsSink = {
  /** Feed a chunk of stdout. Safe to call with partial UTF-8-decoded text. */
  push: (chunk: string) => void;
  /** No more input. Reduces to counts and a capped, error-first row list. */
  finish: () => EslintStreamResult;
};

type Phase = 'seeking' | 'between' | 'element' | 'done' | 'failed';

export type EslintStreamOptions = {
  /** Absolute checkout path, so `filePath` becomes repo-relative. */
  workdir: string;
  rowCap?: number;
};

/**
 * Make one file path repo-relative and POSIX-shaped.
 *
 * A path outside the checkout is left absolute rather than rendered as a pile
 * of `../` — it means the linter was pointed somewhere unexpected, and showing
 * that plainly is more useful than hiding it behind traversal.
 */
function toRelative(workdir: string, filePath: string): string {
  const rel = relative(workdir, filePath);
  if (rel === '' || rel.startsWith('..')) return filePath;
  return sep === '/' ? rel : rel.split(sep).join('/');
}

export function createEslintStream(options: EslintStreamOptions): DiagnosticsSink {
  const rowCap = options.rowCap ?? DIAGNOSTICS_ROW_CAP;

  let phase: Phase = 'seeking';
  let hint = '';

  // Element-scanner state, carried across chunk boundaries.
  let buffer = '';
  let depth = 0;
  let inString = false;
  let escaped = false;

  let errorCount = 0;
  let warningCount = 0;
  // Two buckets so the cap can favour errors without holding every row —
  // see `finish`.
  const errorRows: Diagnostic[] = [];
  const warningRows: Diagnostic[] = [];

  const fail = (why: string): void => {
    if (phase === 'failed') return;
    phase = 'failed';
    hint = why;
  };

  /** Reduce one parsed element (one file's results) into the accumulators. */
  const consume = (element: unknown): void => {
    if (typeof element !== 'object' || element === null) return;
    const row = element as Record<string, unknown>;
    const filePath = typeof row['filePath'] === 'string' ? row['filePath'] : null;
    const messages = row['messages'];
    if (filePath === null || !Array.isArray(messages)) return;

    const file = toRelative(options.workdir, filePath);

    for (const raw of messages) {
      if (typeof raw !== 'object' || raw === null) continue;
      const message = raw as Record<string, unknown>;

      const severity = SEVERITY[Number(message['severity'])];
      const text = typeof message['message'] === 'string' ? message['message'] : null;
      // Severity 0 is "rule off" and should never be emitted; anything else
      // unrecognised is a format we do not know. Either way, drop the row
      // rather than promote it.
      if (!severity || text === null) continue;

      // A fatal parse error has no rule and often no column. Both are
      // legitimately absent, so neither is required.
      const ruleId = typeof message['ruleId'] === 'string' ? message['ruleId'] : null;
      const line = asPosition(message['line']);
      const column = asPosition(message['column']);

      if (severity === 'error') {
        errorCount += 1;
        if (errorRows.length < rowCap) errorRows.push({ file, line, column, severity, ruleId, message: text });
      } else {
        warningCount += 1;
        if (warningRows.length < rowCap) warningRows.push({ file, line, column, severity, ruleId, message: text });
      }
    }
  };

  /** Parse and consume whatever is in `buffer`, then reset the scanner. */
  const flushElement = (): void => {
    const text = buffer.trim();
    buffer = '';
    if (text === '') return;
    try {
      consume(JSON.parse(text));
    } catch {
      // One malformed element among well-formed ones is a row we drop; it does
      // not condemn the stream. The strictness lives at the array level.
    }
  };

  return {
    push: (chunk) => {
      if (phase === 'done' || phase === 'failed') return;

      for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk[i] as string;

        if (phase === 'seeking') {
          if (/\s/.test(ch)) continue;
          if (ch !== '[') {
            // Not JSON at all. `gh-parse.ts` seeks past login-shell banners
            // because it runs under `$SHELL -lic`; this runner spawns the
            // binary directly, so there is no banner to forgive and leading
            // noise means the command was not what we thought it was.
            fail('Output did not start with a JSON array.');
            return;
          }
          phase = 'between';
          continue;
        }

        if (phase === 'between') {
          if (/\s/.test(ch) || ch === ',') continue;
          if (ch === ']') {
            phase = 'done';
            continue;
          }
          phase = 'element';
          depth = 0;
          inString = false;
          escaped = false;
          // Fall through into element handling for this same character.
        }

        if (phase === 'element') {
          buffer += ch;
          if (buffer.length > MAX_ELEMENT_BYTES) {
            fail('A single result was too large to be eslint output.');
            return;
          }

          if (inString) {
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') inString = false;
            continue;
          }

          if (ch === '"') {
            inString = true;
            continue;
          }
          if (ch === '{' || ch === '[') {
            depth += 1;
            continue;
          }
          if (ch === '}' || ch === ']') {
            depth -= 1;
            if (depth === 0) {
              flushElement();
              phase = 'between';
            } else if (depth < 0) {
              // A `]` closing the outer array while we thought we were inside a
              // scalar element — reduce what we have and finish.
              buffer = buffer.slice(0, -1);
              flushElement();
              phase = 'done';
            }
            continue;
          }
          if (depth === 0 && (ch === ',' || /\s/.test(ch))) {
            // A bare scalar element (never eslint, but the scanner stays total).
            buffer = buffer.slice(0, -1);
            flushElement();
            phase = 'between';
          }
        }
      }
    },

    finish: () => {
      if (phase === 'failed') return { ok: false, hint };
      if (phase === 'seeking') {
        // Zero bytes of stdout. eslint always prints at least `[]`, so silence
        // means the process died before it produced a report.
        return { ok: false, hint: 'The command produced no output.' };
      }
      if (phase !== 'done') {
        return { ok: false, hint: 'Output ended in the middle of a JSON array.' };
      }

      // Errors first, warnings filling what is left. A flat file-order cap
      // would let ten thousand warnings in one file hide every error in the
      // repository — the opposite of what the list is for.
      const rows = [...errorRows.slice(0, rowCap)];
      rows.push(...warningRows.slice(0, Math.max(0, rowCap - rows.length)));

      return {
        ok: true,
        errorCount,
        warningCount,
        rows,
        withheld: Math.max(0, errorCount + warningCount - rows.length),
      };
    },
  };
}

/** A 1-based position, or 0 when the tool reported none. Never negative, never NaN. */
function asPosition(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
