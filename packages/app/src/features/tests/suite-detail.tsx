import { Play, Square, Terminal } from 'lucide-react';

import { testSuiteFingerprint, type TestRunResult, type TestSuite } from '@midnite/studio-shared';

import { IconButton } from '../../components/icon-button';
import {
  useCancelTestRun,
  useRunTestSuite,
  useTestTrustStatus,
  useTrustTestSuite,
  useUntrustTestSuite,
} from '../../services/queries';
import { runSuiteInTerminal } from './run-in-terminal';
import { activeRunId, useTestsStore } from './tests-store';

export function SuiteDetail({ repoId, suite }: { repoId: string; suite: TestSuite }) {
  const trust = useTestTrustStatus(repoId, suite.id);
  const trustSuite = useTrustTestSuite(repoId);
  const untrustSuite = useUntrustTestSuite(repoId);
  const runSuite = useRunTestSuite(repoId);
  const cancelRun = useCancelTestRun();

  const run = useTestsStore((s) => s.runs[repoId]?.[suite.id] ?? null);
  const result = useTestsStore((s) => s.results[repoId]?.[suite.id] ?? null);
  const startRun = useTestsStore((s) => s.startRun);

  const isTrusted = trust.data?.state === 'trusted';
  const isRunning = run?.running ?? false;

  const trustAndRun = async (): Promise<void> => {
    if (!isTrusted) {
      const status = await trustSuite.mutateAsync({
        suiteId: suite.id,
        fingerprint: testSuiteFingerprint(suite),
      });
      if (status.state !== 'trusted') return;
    }
    const outcome = await runSuite.mutateAsync(suite.id);
    if (outcome.ok) startRun(repoId, suite.id, outcome.runId);
  };

  const output = (run?.output ?? []).join('');

  return (
    <div role="region" aria-label="Suite detail" className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{suite.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {suite.packageName} · {suite.kind}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            icon={Terminal}
            label="Run in terminal"
            size="sm"
            onClick={() => runSuiteInTerminal(repoId, suite)}
          />
          {isRunning ? (
            <IconButton
              icon={Square}
              label="Cancel run"
              size="sm"
              onClick={() => run && cancelRun(activeRunId(repoId, suite.id) ?? run.runId)}
            />
          ) : (
            <IconButton
              icon={Play}
              label={isTrusted ? 'Run suite' : 'Trust and run suite'}
              size="sm"
              onClick={() => void trustAndRun()}
            />
          )}
        </div>
      </header>

      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Command</dt>
        <dd className="truncate font-mono">{suite.displayCommand}</dd>
        <dt className="text-muted-foreground">Source</dt>
        <dd className="truncate">
          {suite.source === 'moon.yml' ? 'moon.yml' : 'package.json'} · {suite.sourceFile}
        </dd>
        <dt className="text-muted-foreground">Package</dt>
        <dd className="truncate">{suite.package || '(workspace root)'}</dd>
        <dt className="text-muted-foreground">Trust</dt>
        <dd>
          {isTrusted ? (
            <button
              type="button"
              className="text-destructive hover:underline"
              onClick={() => untrustSuite.mutate(suite.id)}
            >
              Trusted — revoke
            </button>
          ) : (
            <span className="text-muted-foreground">
              Not trusted. Running it approves this exact command.
            </span>
          )}
        </dd>
      </dl>

      {result ? <ResultSummary result={result} /> : null}

      {output.length > 0 ? (
        <pre className="mt-3 min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
          {output}
        </pre>
      ) : null}
    </div>
  );
}

function ResultSummary({ result }: { result: TestRunResult }) {
  if (!result.ok) {
    return (
      <p className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
        {result.hint}
      </p>
    );
  }

  return (
    <div className="mb-3 space-y-1.5">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-emerald-600 dark:text-emerald-400">{result.passed} passed</span>
        <span className="text-destructive">{result.failed} failed</span>
        <span className="text-muted-foreground">{result.skipped} skipped</span>
        {!result.structured ? (
          <span className="text-muted-foreground">
            (exit code {result.exitCode ?? '—'} — output not structured)
          </span>
        ) : null}
      </div>
      {result.failures.length > 0 ? (
        <ul className="space-y-1">
          {result.failures.map((f, i) => (
            <li key={i} className="rounded border border-destructive/20 bg-destructive/5 px-2 py-1 text-xs">
              <p className="font-medium">{f.name}</p>
              {f.file ? <p className="text-muted-foreground">{f.file}</p> : null}
              <p className="text-destructive">{f.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
