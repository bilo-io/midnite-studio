import type { Diagnostic, DiagnosticsRun } from '@midnite/studio-shared';
import { BsExclamationCircle, BsXCircle } from 'react-icons/bs';

/**
 * The problems themselves, as `file:line` with rule and message.
 *
 * **Says what it withheld.** The counts that arrive are always complete — the
 * runner stream-parses, so a repo with 40,000 problems reports 40,000 — but only
 * the first `DIAGNOSTICS_ROW_CAP` rows are carried across. Rendering those and
 * stopping would be a list that silently lies about its own length, which is
 * the exact trap Phase 17's `EXPAND_ALL_LIMIT` rule was written for: a cap is
 * fine, a cap you cannot see is not.
 */
export function ProblemList({ run }: { run: Extract<DiagnosticsRun, { ok: true }> }) {
  if (run.rows.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        No problems reported.
      </p>
    );
  }

  return (
    <>
      <ul className="max-h-64 overflow-y-auto">
        {run.rows.map((row, index) => (
          <ProblemRow key={`${row.file}:${row.line}:${row.ruleId}:${index}`} row={row} />
        ))}
      </ul>
      {run.withheld > 0 ? (
        <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          Showing {run.rows.length.toLocaleString()} of{' '}
          {(run.rows.length + run.withheld).toLocaleString()} — {run.withheld.toLocaleString()} not
          listed.
        </p>
      ) : null}
    </>
  );
}

function ProblemRow({ row }: { row: Diagnostic }) {
  return (
    <li className="flex items-baseline gap-2 px-3 py-1 text-xs odd:bg-muted/30">
      {row.severity === 'error' ? (
        <BsXCircle aria-hidden className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
      ) : (
        <BsExclamationCircle
          aria-hidden
          className="mt-0.5 h-3 w-3 shrink-0"
          style={{ color: 'hsl(var(--health-warn))' }}
        />
      )}
      <span className="min-w-0 flex-1">
        {/*
          `file:line` as one token, in the shape an editor or a terminal would
          print it — it is the form you can paste somewhere that will act on it.
          There is nowhere in this app to jump TO (the Folder view is a
          read-only browser with no editor), so making it copyable text rather
          than a dead-end link is the honest affordance.
        */}
        {/*
          `break-all`, because a repo path is one unbreakable token. Without it
          the span overflows its `flex-1` box and runs UNDER the rule id in the
          next column — the flex child stays the right width while its text
          does not, which is the failure `min-w-0` alone does not catch.
        */}
        <span className="break-all font-mono text-[11px] text-foreground">
          {row.file}
          {/*
            `0` is the contract's "the tool reported this against the file, not
            a position" — a config error, a missing plugin. Printing `:0:0`
            would invite a jump to a line that does not exist.
          */}
          {row.line === 0 ? '' : `:${row.line}`}
          {row.line !== 0 && row.column !== 0 ? `:${row.column}` : ''}
        </span>{' '}
        <span className="text-muted-foreground">{row.message}</span>
      </span>
      {row.ruleId ? (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground opacity-70">
          {row.ruleId}
        </span>
      ) : null}
    </li>
  );
}

/** Why a run produced nothing, in the user's terms rather than a reason code. */
export function failureText(run: Extract<DiagnosticsRun, { ok: false }>): string {
  switch (run.reason) {
    case 'no-command':
      return 'No linter was found in this repository.';
    case 'untrusted':
      return 'Diagnostics are not enabled for this repository.';
    case 'not-installed':
      return 'The configured command is not installed here.';
    case 'timed-out':
      return 'The linter did not finish in time.';
    case 'parse-failed':
      return 'The linter ran, but its output could not be read.';
    default:
      // Exhaustive today; a new reason code added in main should render as
      // something rather than as an empty box.
      return run.hint || 'Diagnostics could not run.';
  }
}
