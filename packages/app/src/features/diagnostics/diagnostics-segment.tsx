import { useEffect, useRef, useState } from 'react';
import { BsCheckCircle, BsExclamationCircle, BsXCircle } from 'react-icons/bs';

import {
  commandFingerprint,
  commandLine,
  type DiagnosticsCommand,
  type DiagnosticsRun,
} from '@midnite/studio-shared';

import { ConfirmDialog, type ConfirmRequest } from '../../components/confirm-dialog';
import { Popover } from '../../components/popover';
import {
  useDiagCandidates,
  useDiagResult,
  useDiagTrust,
  useRepos,
  useRunDiagnostics,
  useTrustDiagnostics,
  useUntrustDiagnostics,
} from '../../services/queries';
import { useActiveWorktree } from '../../services/use-status';
import { ProblemList, failureText } from './problem-list';

/**
 * Error and warning counts for the selected repository, in the footer.
 *
 * **It follows `useActiveWorktree()` — the sidebar selection — not the active
 * workbench tab.** Several tabs can point at different repositories, so the two
 * genuinely disagree. The branch name and the ahead/behind arrows sitting
 * inches to the left are sidebar-driven, and a footer that disagrees with
 * itself is worse than one that is occasionally behind the tab you are reading.
 *
 * **Absent is not zero.** A repository nobody has measured shows a distinct
 * resting state, never a green "0 problems" — the same trap `useWorktreeStatuses`
 * documents about `isPlaceholderData` reporting every checkout clean while its
 * queries are still in flight. "Clean" is a claim; you have to have looked.
 */
export function DiagnosticsSegment() {
  const { repoId } = useActiveWorktree();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  const trust = useDiagTrust(repoId);
  const state = trust.data?.state;
  const result = useDiagResult(repoId);
  /*
    Detected whenever the segment is a prompt rather than a readout — which is
    every arm except `trusted`.

    `useDiagCandidates` documents the cost it is guarding against: nothing
    should stat a repo's `node_modules` merely to draw a footer. A trusted
    repo, the steady state, still never does. The other three arms all render a
    button whose only destination is the consent dialog, and that dialog has to
    say WHY a command is being offered — evidence fetched after the click would
    arrive after the user has already read the prompt.
  */
  const detect = useDiagCandidates(repoId, state !== undefined && state !== 'trusted');
  const grant = useTrustDiagnostics(repoId);
  const revoke = useUntrustDiagnostics(repoId);
  const runner = useRunDiagnostics(repoId);

  /*
    Where the command will run, for the prompt to say out loud.

    Theme E's `DiagnosticsTrustStatus` deliberately does not carry it — main
    resolves the workdir per run through `resolveWorkdir(repoId)`, and a path
    baked into a trust record would go stale the moment a repo moved. The
    renderer already knows the checkout root from the repo registry, so it is
    read from there rather than added to the wire.
  */
  const repos = useRepos();
  const workdir = repos.data?.find((repo) => repo.id === repoId)?.path ?? null;

  /*
    Theme E's `useDiagResult` never fetches — its cache is written by the
    mutation and by nothing else, so `undefined` means "never measured" rather
    than "in flight". That leaves someone to ask for the first run, and it is
    this component: once per repository, when the trust grant already exists
    and nothing is cached.

    The ref is what keeps "once" true. A bare `!result.data` guard re-fires on
    every render between the mutation starting and its result landing, and the
    thing being repeated is a spawned process.
  */
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (repoId === null || state !== 'trusted') return;
    if (result.data !== undefined || requested.current === repoId) return;
    requested.current = repoId;
    runner.mutate();
  }, [repoId, state, result.data, runner]);

  if (repoId === null || trust.isLoading) return null;

  // Nothing to offer and nothing to show. Unlike the other states this one is
  // genuinely silent: a repository with no linter has no diagnostics feature to
  // be broken, and an "enable" button that leads to "we found nothing" is worse
  // than no button.
  const candidate = detect.data?.[0];
  if (state === 'no-command' && !candidate) return null;

  const askToEnable = (command: DiagnosticsCommand): void => {
    const evidence =
      detect.data?.find((entry) => commandFingerprint(entry) === commandFingerprint(command))
        ?.evidence ?? [];
    setConfirm({
      title:
        state === 'command-changed'
          ? 'Run this different command?'
          : 'Run this repository’s linter?',
      /*
        The literal command and the resolved working directory, both spelled
        out. This is the app's first execution of code that came from a folder
        the user merely opened to look at, and the only honest way to ask for
        that is to show exactly what will run and where. "Enable diagnostics?"
        would be asking them to approve something they cannot see.
      */
      body: `${commandLine(command)}\n\nin ${workdir ?? 'this repository'}`,
      confirmLabel: state === 'command-changed' ? 'Run the new command' : 'Enable and run',
      danger: true,
      /*
        Explicitly "nothing to count", not "still counting".

        `ConfirmDialog` reads an ABSENT `blastRadius` as a `rev-list` still in
        flight and says "Checking what this affects…". Nothing here counts
        commits — the consequence is an execution, which the warnings state —
        so leaving it absent would park a spinner-sentence in the dialog that
        never resolves.
      */
      blastRadius: null,
      warnings: [
        'This runs a program from the repository itself, with your permissions.',
        ...(state === 'command-changed'
          ? ['This is not the command you approved previously.']
          : []),
        /*
          Only the evidence for the command actually being approved. A repo can
          detect one command while its trust record names another, and pinning
          this candidate's reasons onto that command would be citing evidence
          for something the user is not being asked about.
        */
        ...(evidence.length ? [`Proposed because: ${evidence.join(', ')}`] : []),
      ],
      onConfirm: () => {
        grant.mutate(command, {
          // Approving is the ask; a grant that then sits there showing "not
          // measured" makes the user click twice for one decision.
          onSuccess: () => {
            requested.current = repoId;
            runner.mutate();
          },
        });
        setConfirm(null);
      },
    });
  };

  /*
    `command-changed` means the configured command is no longer the approved
    one, so the freshly detected candidate is the thing to offer — showing the
    stored command would be asking the user to re-approve what they already
    approved.
  */
  const proposed =
    state === 'command-changed'
      ? (candidate ?? trust.data?.command ?? null)
      : (trust.data?.command ?? candidate ?? null);

  return (
    <>
      {state === 'trusted' ? (
        <Popover
          open={open}
          onOpenChange={setOpen}
          side="top"
          /*
            `start` since Phase 39 moved this segment into the left zone.
            `align="end"` right-aligns the panel against its trigger, which was
            right hard against the window's right edge and is wrong at the left
            edge — `Popover` clamps to the viewport, so the failure mode is a
            panel that visually detaches from the control that opened it rather
            than one that disappears, which is why this wants an eye and not
            only a test.
          */
          align="start"
          label="Problems in this repository"
          testId="diagnostics-segment"
          panelClassName="w-[420px] max-w-[calc(100vw-1rem)]"
          trigger={<Counts run={result.data} pending={runner.isPending} />}
        >
          <DiagnosticsPanel
            run={result.data}
            pending={runner.isPending}
            onRerun={() => runner.mutate()}
            onDisable={() => {
              revoke.mutate();
              // So re-enabling in the same session measures again rather than
              // trusting a `requested` flag left over from the last grant.
              requested.current = null;
            }}
          />
        </Popover>
      ) : (
        /*
          Untrusted, or trusted for a command that has since changed. Either way
          the segment is a control, not silence — a feature that renders nothing
          is indistinguishable from a broken one, and the whole point of an
          opt-in gate is that the user can find the opt-in.
        */
        <button
          type="button"
          data-testid="diagnostics-enable"
          onClick={() => proposed && askToEnable(proposed)}
          className="flex items-center gap-1 rounded px-1.5 transition-colors hover:bg-accent hover:text-foreground"
        >
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/60"
          />
          {state === 'command-changed' ? 'Diagnostics command changed' : 'Enable diagnostics'}
        </button>
      )}

      {confirm ? <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} /> : null}
    </>
  );
}

/**
 * The two pills.
 *
 * `--destructive` and `--health-warn` rather than raw HSL: unlike the metric
 * colours beside them, these are **semantic**. An error count genuinely means
 * "something is wrong", which is what the token is for — and it should follow
 * the theme's idea of alarming rather than carry a hue of its own.
 *
 * The clean state is the one exception: it uses the same
 * `emerald-600`/`emerald-400` pair as the finance segment's gain colour
 * (`../finance/finance-segment.tsx`) rather than `--health-ok`, so "no
 * problems" reads as the same green as a rising ticker elsewhere in this
 * footer instead of the theme's separate success hue.
 */
function Counts({
  run,
  pending,
}: {
  run: DiagnosticsRun | undefined;
  pending: boolean;
}) {
  if (pending && !run) {
    return <span className="text-muted-foreground">Checking…</span>;
  }

  // Trusted, but never actually measured — or measured and failed. Neither is
  // "0 problems", and both have to look different from a clean result.
  if (!run || !run.ok) {
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <span aria-hidden className="h-2 w-2 rounded-full border border-muted-foreground/60" />
        Problems: not measured
      </span>
    );
  }

  if (run.errorCount === 0 && run.warningCount === 0) {
    return (
      <span
        className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
        aria-label="No problems"
      >
        <BsCheckCircle aria-hidden className="h-3 w-3 shrink-0" />
        <span>No problems</span>
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-2"
      aria-label={`${run.errorCount} errors, ${run.warningCount} warnings`}
    >
      {run.errorCount > 0 ? (
        <span
          data-testid="diag-errors"
          className="flex items-center gap-1 text-[11px] font-medium leading-none tabular-nums text-destructive"
        >
          <BsXCircle aria-hidden className="h-3 w-3 shrink-0 text-destructive" />
          <span>{run.errorCount}</span>
        </span>
      ) : null}
      {run.warningCount > 0 ? (
        <span
          data-testid="diag-warnings"
          className="flex items-center gap-1 text-[11px] font-medium leading-none tabular-nums"
          style={{ color: 'hsl(var(--health-warn))' }}
        >
          <BsExclamationCircle
            aria-hidden
            className="h-3 w-3 shrink-0"
            style={{ color: 'hsl(var(--health-warn))' }}
          />
          <span>{run.warningCount}</span>
        </span>
      ) : null}
    </span>
  );
}

function DiagnosticsPanel({
  run,
  pending,
  onRerun,
  onDisable,
}: {
  run: DiagnosticsRun | undefined;
  pending: boolean;
  onRerun: () => void;
  onDisable: () => void;
}) {
  return (
    <div>
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Problems
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onRerun}
            disabled={pending}
            className="rounded px-1.5 py-0.5 text-[11px] transition-colors hover:bg-accent disabled:opacity-50"
          >
            {pending ? 'Running…' : 'Re-run'}
          </button>
          <button
            type="button"
            onClick={onDisable}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
          >
            Disable
          </button>
        </div>
      </header>

      {run?.ok ? (
        <ProblemList run={run} />
      ) : (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          {run ? failureText(run) : 'Not measured yet.'}
        </p>
      )}

      {/*
        Re-running is manual, and saying so is part of the design rather than an
        apology for it: the fs watcher fires on every keystroke-save, and a
        linter on that cadence would make the footer the most expensive thing in
        the app.
      */}
      {run?.ok ? (
        <p className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
          Measured {relativeTime(run.ranAt)}. Does not re-run on file changes.
        </p>
      ) : null}
    </div>
  );
}

/** Coarse on purpose — the point is staleness, not a timestamp. */
function relativeTime(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}
