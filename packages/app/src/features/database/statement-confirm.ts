import { useCallback } from 'react';

import { sniffStatementKind } from '@midnite/studio-shared';

import { useDialogs } from '../../components/dialog-host';

/**
 * Theme I — the destructive-statement safety gate.
 *
 * Reuses the app's existing blast-radius confirm pattern
 * (`useDialogs().confirm`, `components/confirm-dialog.tsx`) rather than a new
 * one, per `CLAUDE.md`'s "destructive ops need a confirm dialog showing blast
 * radius" rule — the same pattern every git op in this app already uses (see
 * `features/repos/use-repo-actions.ts`).
 *
 * **This is a standalone primitive, not wired into a call site.** There is no
 * query tab editor yet (Theme G, out of scope this batch) to call it from —
 * the phase doc's Theme I lists the gate itself as the deliverable and names
 * Theme F's editability checks and (implicitly) Theme G's "run" action as its
 * future consumers. Exported as a hook so a future `query-editor.tsx`'s "run"
 * handler becomes one call: `confirm({ sql, connectionName, onRun: run })`.
 *
 * `BlastRadius` is deliberately not used — its shape is git-only (`{count,
 * sample: {sha, subject}[]}`, see `confirm-dialog.tsx`) and a SQL statement has
 * no shas. `warnings: string[]` carries the estimate instead, and it is
 * omitted rather than guessed when the provider gives no `EXPLAIN`-derived
 * count (Theme I's own scope note) — passing `blastRadius: null` (not
 * `undefined`) says outright "nothing left to count", not "still counting".
 */
export type StatementConfirmRequest = {
  /** The full (possibly multi-statement) SQL about to run. */
  sql: string;
  /** Named in the dialog so the person confirms against the right database. */
  connectionName: string;
  /**
   * An `EXPLAIN`-derived row-count estimate, where the provider supports it.
   * `undefined` — never a guessed number — omits the line entirely.
   */
  estimatedRowCount?: number;
  /** Called once the statement is cleared to run — immediately for a read, on confirm for a write. */
  onRun: () => void;
};

export function useStatementConfirm() {
  const dialogs = useDialogs();

  return useCallback(
    ({ sql, connectionName, estimatedRowCount, onRun }: StatementConfirmRequest) => {
      // 'read' covers SELECT, EXPLAIN, and a CTE whose main statement and
      // every CTE body are reads — see `sniffStatementKind`'s own docstring
      // for the WITH…DELETE case this must not get wrong.
      if (sniffStatementKind(sql) === 'read') {
        onRun();
        return;
      }

      const warnings: string[] = [`Runs against ${connectionName}.`];
      if (estimatedRowCount !== undefined) {
        warnings.push(
          `Estimated ${estimatedRowCount} row${estimatedRowCount === 1 ? '' : 's'} affected.`,
        );
      }

      dialogs.confirm({
        title: 'Run this statement?',
        body: sql,
        confirmLabel: 'Run statement',
        danger: true,
        // Explicitly null: a SQL row estimate has no commits to count, so
        // there is nothing "still being counted" the way a git blast radius
        // is — see this module's own docstring.
        blastRadius: null,
        warnings,
        onConfirm: onRun,
      });
    },
    [dialogs],
  );
}
