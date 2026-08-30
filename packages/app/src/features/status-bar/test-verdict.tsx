import type { TestRunResult } from '@midnite/studio-shared';

import { useActiveWorktree } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';
import { useTestsStore } from '../tests/tests-store';

export type TestVerdict = { label: string; failing: boolean };

/**
 * A worst-of rollup across a repo's suites. Pure so the rule is testable
 * without the store.
 *
 * `TestRunResult` is a discriminated union on `ok` with no pass/fail enum:
 * `ok: true` means the runner ran, and pass/fail is `failed === 0`. In
 * order: any suite that ran with failures → fail. If every present suite
 * could not run at all → `null` — a runner that could not start has
 * produced no verdict, and a red light for "we could not look" is the exact
 * trap `DiagnosticsSegment` warns about. Otherwise, the suites that did run
 * clean → pass.
 */
export function testVerdict(results: Record<string, TestRunResult> | undefined): TestVerdict | null {
  if (!results) return null;
  const values = Object.values(results);
  if (values.length === 0) return null;

  const failing = values.filter((r) => r.ok && r.failed > 0).length;
  if (failing > 0) return { label: `${failing} failing`, failing: true };

  if (values.every((r) => !r.ok)) return null;

  const passing = values.filter((r) => r.ok && r.failed === 0).length;
  return { label: `${passing} suites passing`, failing: false };
}

/**
 * The indicator `FooterCluster`'s own comment reserved a slot for in
 * Phase 18, which Phase 17 never filled. `results[repoId]` is `undefined`
 * before any run and the store is deliberately unpersisted, so a fresh
 * launch renders nothing — that is correct and must not be "fixed" into a
 * grey placeholder.
 */
export function TestVerdictSegment() {
  const { repoId } = useActiveWorktree();
  const results = useTestsStore((s) => (repoId ? s.results[repoId] : undefined));
  const verdict = testVerdict(results);
  if (!verdict) return null;

  return (
    <button
      type="button"
      data-testid="status-segment-test-verdict"
      onClick={() => useUiStore.getState().setActiveView('tests')}
      className={`rounded px-1.5 transition-colors hover:bg-accent ${
        verdict.failing ? 'font-medium text-destructive' : 'text-muted-foreground'
      }`}
    >
      {verdict.label}
    </button>
  );
}
