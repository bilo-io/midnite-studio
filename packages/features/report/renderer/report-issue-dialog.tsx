import { useEffect, useState } from 'react';

import { Accordion } from '@bilo-io/ui';
import { LuCheck, LuCircleAlert, LuCopy, LuExternalLink, LuLoaderCircle } from 'react-icons/lu';

import { bridge, FrameModal, RingSpinner as Spinner } from '@midnite/studio-frame';
import {
  appIssueBody,
  appIssueFormUrl,
  DEFAULT_ISSUE_APP,
  FORGE_BODY_MAX,
  type AppIssueSubmitRequest,
  type AppIssueSubmitResult,
  type ForgeCliStatus,
} from '@midnite/studio-shared';

import { useReportIssueStore } from './report-issue-store';

/**
 * Files a bug or feature request against `bilo-io/midnite-apps` from inside any midnite app — the
 * Phase 93 dialog Studio had, moved into the report feature so every app reports the same way.
 *
 * **It reaches main only through `bridge().report`** (`ghStatus`, `bundle`, `submitIssue`,
 * `openUrl`, `copy`) plus `appVersion`, so an app wires it by exposing that one namespace
 * (`createReportBridge`) and registering the feature's main half. No react-query: an app may have
 * no `QueryClientProvider`, so the gh probe and the submission are this component's own state.
 *
 * **`app` names the filing app** (`midnite-studio` by default): it is the body's `### App` section,
 * the form URL's `app=` and the submission's `app`, which main turns into the `app: <slug>` label.
 *
 * **Redaction stays the single path.** The diagnostics text is rendered byte-identical to what
 * `report.bundle()` returns — already redacted main-side through `redactPaths` — and this component
 * never calls `redactPaths` itself. The body is clamped to `FORGE_BODY_MAX` defensively before it
 * reaches the IPC boundary, on top of (not instead of) the schema's own cap.
 *
 * **Without `gh` it still files.** On a machine without a signed-in `gh` (or when `gh` refuses), the
 * primary action becomes *Continue on GitHub*, which opens midnite-apps' own issue form prefilled
 * with the same title, words and diagnostics (`appIssueFormUrl`).
 *
 * **And when neither works, Copy report** puts the whole title and body on the clipboard
 * (main-side, since a packaged `file://` origin has no `navigator.clipboard`).
 *
 * **One app-wide instance besides any local ones.** `ReportIssueHost` is mounted once at the app
 * root and opened through `openReportIssue()` — and by main's `report:open` event, for an app whose
 * Help menu has the item.
 */

type AppIssueKind = AppIssueSubmitRequest['kind'];

const KIND_COPY: Record<
  AppIssueKind,
  { label: string; titlePrefix: string; fieldLabel: string; placeholder: string }
> = {
  bug: {
    label: 'Bug',
    titlePrefix: '[bug] ',
    fieldLabel: 'What happened?',
    placeholder: 'What you did, what you expected, and what happened instead.',
  },
  feature: {
    label: 'Feature',
    titlePrefix: '[feat] ',
    fieldLabel: "What's the problem?",
    placeholder: 'The situation you are in when you want this, rather than the solution.',
  },
};

/**
 * The issue body, laid out by `appIssueBody` as midnite-apps' own issue forms render — the
 * diagnostics text passed through as-is, never re-formatted or re-redacted here.
 */
export function composeIssueBody(draft: {
  kind: AppIssueKind;
  description: string;
  diagnostics: string;
  version?: string;
  app?: string;
}): string {
  return appIssueBody({ ...draft, title: '' }).slice(0, FORGE_BODY_MAX);
}

export type ReportIssueDialogProps = {
  open: boolean;
  onClose: () => void;
  /** The filing app's slug (`midnite-<name>`) — its label and its `### App` section. */
  app?: string;
};

/** No bridge (a plain browser, a test without one): the same "nothing was attempted" answers Studio used. */
const NO_CLI: ForgeCliStatus = { reason: 'not-installed', binPath: null, hint: '' };
const NO_WRITE: AppIssueSubmitResult = { ok: false, cli: NO_CLI, error: null, url: null };

export function ReportIssueDialog({ open, onClose, app = DEFAULT_ISSUE_APP }: ReportIssueDialogProps) {
  const [kind, setKind] = useState<AppIssueKind>('bug');
  const [title, setTitle] = useState(KIND_COPY.bug.titlePrefix);
  const [description, setDescription] = useState('');
  const [bundle, setBundle] = useState<{ text: string; loading: boolean }>({
    text: '',
    loading: false,
  });

  const [copied, setCopied] = useState(false);

  const [cliStatus, setCliStatus] = useState<ForgeCliStatus | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AppIssueSubmitResult | undefined>(undefined);
  const resetSubmit = () => {
    setPending(false);
    setResult(undefined);
  };

  // Fresh draft every time the dialog opens — a report filed once should not
  // haunt the next open, and the diagnostics tail is re-fetched because time
  // has passed since it was last read.
  useEffect(() => {
    if (!open) return;
    setKind('bug');
    setTitle(KIND_COPY.bug.titlePrefix);
    setDescription('');
    setCopied(false);
    resetSubmit();

    const api = bridge();
    if (!api) {
      setBundle({ text: '', loading: false });
      setCliStatus(NO_CLI);
      return;
    }
    let cancelled = false;
    setBundle({ text: '', loading: true });
    // Re-probed on every open: `gh auth login` happens in a terminal beside the app.
    void api.report
      .ghStatus()
      .then((status) => {
        if (!cancelled) setCliStatus(status);
      })
      .catch(() => {
        if (!cancelled) setCliStatus(undefined);
      });
    void api.report
      .bundle()
      .then((res) => {
        if (!cancelled) setBundle({ text: res.text, loading: false });
      })
      .catch(() => {
        if (!cancelled) setBundle({ text: '', loading: false });
      });
    return () => {
      cancelled = true;
    };
    // Reset keys on `open` alone: `app` and the setters never change a draft mid-flight.
  }, [open]);

  const switchKind = (next: AppIssueKind) => {
    if (next === kind) return;
    // A title still at the previous kind's bare prefix follows the toggle;
    // anything the user actually typed is their own words and survives it.
    setTitle((current) =>
      current === KIND_COPY[kind].titlePrefix ? KIND_COPY[next].titlePrefix : current,
    );
    setKind(next);
  };

  const cliReady = cliStatus?.reason === 'ready';
  const cliChecked = cliStatus !== undefined;
  const showFallback = cliChecked && !cliReady;

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const canSubmit =
    trimmedTitle.length > 0 && trimmedDescription.length > 0 && !pending && !showFallback;

  const submitError = result && !result.ok ? (result.error ?? cliHint(result.cli)) : null;

  const close = () => {
    resetSubmit();
    onClose();
  };

  const openIssuePage = (url: string) => {
    // A refused URL resolves `{ok:false}`; a lost bridge must not become an unhandled rejection.
    void Promise.resolve(bridge()?.report.openUrl({ url })).catch(() => null);
  };

  const canContinueOnGitHub = trimmedTitle.length > 0 && trimmedDescription.length > 0;
  const continueOnGitHub = () => {
    if (!canContinueOnGitHub) return;
    openIssuePage(
      appIssueFormUrl({
        kind,
        title: trimmedTitle,
        description,
        diagnostics: bundle.text,
        version: bridge()?.appVersion,
        app,
      }),
    );
    close();
  };

  const body = () =>
    composeIssueBody({ kind, description, diagnostics: bundle.text, version: bridge()?.appVersion, app });

  const onSubmit = () => {
    if (!canSubmit) return;
    const api = bridge();
    if (!api) {
      setResult(NO_WRITE);
      return;
    }
    setPending(true);
    // A rejected call leaves no result, as the react-query mutation Studio used to hold did.
    void api.report
      .submitIssue({ title: trimmedTitle, body: body(), kind, app })
      .then(setResult, () => setResult(undefined))
      .finally(() => setPending(false));
  };

  const copyReport = async () => {
    const text = `${trimmedTitle}\n\n${body()}`;
    const written = await bridge()
      ?.report.copy({ text })
      .catch(() => null);
    if (!written?.ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <FrameModal
      open={open}
      onClose={close}
      scope="window"
      title="Report an issue"
      size="md"
      testId="report-issue-dialog"
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Report an issue</h2>

        <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Issue kind">
          {(Object.keys(KIND_COPY) as AppIssueKind[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked={kind === candidate}
              onClick={() => switchKind(candidate)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                kind === candidate
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {KIND_COPY[candidate].label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{KIND_COPY[kind].fieldLabel}</span>
          <textarea
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={KIND_COPY[kind].placeholder}
            className="resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </label>

        {/*
          Collapsible, on by default for a bug (there is likely a crash to
          show) and off by default for a feature (there is not) — keyed by
          `kind` so toggling remounts `Accordion` at its new default rather
          than carrying over whatever the user left the other kind's copy at.
        */}
        <Accordion key={kind} title="Diagnostics" variant="bare" defaultOpen={kind === 'bug'}>
          {bundle.loading ? (
            <p className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
              <LuLoaderCircle aria-hidden className="h-3.5 w-3.5 animate-spin" />
              Reading the diagnostics log…
            </p>
          ) : bundle.text.length > 0 ? (
            <pre
              data-testid="report-issue-diagnostics"
              className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/30 p-2 font-mono text-[10px] text-muted-foreground"
            >
              {bundle.text}
            </pre>
          ) : (
            <p className="py-1 text-xs text-muted-foreground">Nothing logged yet this session.</p>
          )}
        </Accordion>

        {showFallback ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2.5">
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <LuCircleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {cliHint(cliStatus)}
            </p>
            <p className="text-xs text-muted-foreground">
              Continue on GitHub opens the issue form with all of this filled in, to submit from
              your browser.
            </p>
          </div>
        ) : null}

        {result && result.ok ? (
          <p className="text-xs text-foreground">
            Filed.{' '}
            {result.url ? (
              // A single action, not two: viewing the issue is also how this
              // dialog is dismissed on success, the same "and closes" the
              // phase doc describes — the link is the exit, not a detour
              // before one.
              <button
                type="button"
                onClick={() => {
                  openIssuePage(result.url as string);
                  close();
                }}
                className="font-medium text-primary underline underline-offset-2"
              >
                View issue
              </button>
            ) : (
              'No link came back, but it was filed.'
            )}
          </p>
        ) : null}

        {submitError ? (
          <div className="flex flex-col gap-1.5">
            <p role="alert" className="text-xs text-destructive">
              {submitError}
            </p>
            <button
              type="button"
              onClick={continueOnGitHub}
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              <LuExternalLink aria-hidden className="h-3.5 w-3.5" />
              Continue on GitHub instead
            </button>
          </div>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            disabled={!canContinueOnGitHub}
            onClick={() => void copyReport()}
            className="mr-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copied ? (
              <LuCheck aria-hidden className="h-3.5 w-3.5" />
            ) : (
              <LuCopy aria-hidden className="h-3.5 w-3.5" />
            )}
            {copied ? 'Copied' : 'Copy report'}
          </button>
          <button
            type="button"
            onClick={close}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {showFallback ? (
            <button
              type="button"
              disabled={!canContinueOnGitHub}
              onClick={continueOnGitHub}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LuExternalLink aria-hidden className="h-3.5 w-3.5" />
              Continue on GitHub
            </button>
          ) : null}
          {!showFallback && !result?.ok ? (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? (
                <>
                  <Spinner className="size-3 border-primary-foreground/30 border-r-primary-foreground border-t-primary-foreground" />
                  Submitting…
                </>
              ) : (
                'Submit'
              )}
            </button>
          ) : null}
        </div>
      </div>
    </FrameModal>
  );
}

/**
 * The app-wide instance: mount once at the app root. Opened by `openReportIssue()` (a palette
 * command, a button) and by main's `report:open` event (a native Help ▸ Report an Issue… item).
 */
export function ReportIssueHost({ app }: { app?: string } = {}) {
  const open = useReportIssueStore((s) => s.open);
  const setOpen = useReportIssueStore((s) => s.setOpen);
  useEffect(() => bridge()?.report.onOpen?.(() => setOpen(true)), [setOpen]);
  return <ReportIssueDialog open={open} onClose={() => setOpen(false)} {...(app ? { app } : {})} />;
}

/** `gh`'s own hint when it has one; a generic sentence per unready reason otherwise. */
function cliHint(cli: { reason: string; hint: string } | undefined): string {
  if (!cli) return 'The GitHub CLI could not be reached.';
  if (cli.hint.length > 0) return cli.hint;
  return cli.reason === 'not-installed'
    ? 'The GitHub CLI (gh) is not installed.'
    : 'The GitHub CLI is not signed in.';
}
