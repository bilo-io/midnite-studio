import { useEffect, useState } from 'react';

import { Accordion } from '@bilo-io/ui';
import { LuCircleAlert, LuExternalLink, LuLoaderCircle } from 'react-icons/lu';

import { FORGE_BODY_MAX, NEW_ISSUE_URL, type AppIssueSubmitRequest } from '@midnite/studio-shared';

import { bridge } from '../services/bridge';
import { openExternal, useForgeCli, useSubmitAppIssue } from '../services/queries';
import { Modal } from './modal';
import { Spinner } from './skeleton';

/**
 * Files a bug or feature request against `bilo-io/midnite-apps` from inside
 * the app — Phase 93 Theme C.
 *
 * Lives beside `confirm-dialog.tsx`/`prompt-dialog.tsx` rather than under
 * `features/`: it is triggered from two unrelated places
 * (`monitor-page.tsx`'s Diagnostics accordion and `version-notes-panel.tsx`),
 * neither of which owns it. Unlike those two dialogs, it is not routed through
 * `DialogHost` — `confirm`/`notify`/`openMenu` all take a one-shot request
 * object with no local state of their own, where this one owns a form (a
 * kind toggle, a title, a description, a fetched diagnostics block) across a
 * multi-step submit. Each call site keeps its own `open` boolean and renders
 * `<ReportIssueDialog open={…} onClose={…} />` directly — the same pattern
 * `browser-launcher.tsx` already uses for a feature-owned modal.
 *
 * **Redaction stays the single path (Theme D).** The diagnostics text below
 * is rendered byte-identical to what `report.bundle()` returns — already
 * redacted main-side through `redactPaths` (Phase 65 Theme B) — and this
 * component never calls `redactPaths` itself. The only shaping done here is
 * string concatenation (description + a header + the diagnostics block), and
 * the result is clamped to `FORGE_BODY_MAX` defensively before it reaches the
 * IPC boundary, on top of (not instead of) the schema's own cap — a renderer
 * bug that produced a runaway string should not depend on the main process to
 * notice.
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
 * Join the user's own words with the diagnostics block as two markdown
 * sections, the way `gh issue create --body` already renders on GitHub —
 * never a re-formatting of the diagnostics text itself.
 */
export function composeIssueBody(description: string, diagnostics: string): string {
  const trimmedDescription = description.trim();
  const trimmedDiagnostics = diagnostics.trim();
  const body =
    trimmedDiagnostics.length === 0
      ? trimmedDescription
      : `${trimmedDescription}\n\n---\n\n## Diagnostics\n\n\`\`\`\n${trimmedDiagnostics}\n\`\`\``;
  return body.slice(0, FORGE_BODY_MAX);
}

export type ReportIssueDialogProps = {
  open: boolean;
  onClose: () => void;
};

export function ReportIssueDialog({ open, onClose }: ReportIssueDialogProps) {
  const [kind, setKind] = useState<AppIssueKind>('bug');
  const [title, setTitle] = useState(KIND_COPY.bug.titlePrefix);
  const [description, setDescription] = useState('');
  const [bundle, setBundle] = useState<{ text: string; loading: boolean }>({
    text: '',
    loading: false,
  });

  const cli = useForgeCli();
  const submit = useSubmitAppIssue();

  // Fresh draft every time the dialog opens — a report filed once should not
  // haunt the next open, and the diagnostics tail is re-fetched because time
  // has passed since it was last read.
  useEffect(() => {
    if (!open) return;
    setKind('bug');
    setTitle(KIND_COPY.bug.titlePrefix);
    setDescription('');
    submit.reset();

    const api = bridge();
    if (!api) {
      setBundle({ text: '', loading: false });
      return;
    }
    let cancelled = false;
    setBundle({ text: '', loading: true });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only keys on `open`
  }, [open]);

  const switchKind = (next: AppIssueKind) => {
    if (next === kind) return;
    // A title still at the previous kind's bare prefix follows the toggle;
    // anything the user actually typed is their own words and survives it.
    setTitle((current) => (current === KIND_COPY[kind].titlePrefix ? KIND_COPY[next].titlePrefix : current));
    setKind(next);
  };

  const cliStatus = cli.data;
  const cliReady = cliStatus?.reason === 'ready';
  const cliChecked = cliStatus !== undefined;
  const showFallback = cliChecked && !cliReady;

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const canSubmit =
    trimmedTitle.length > 0 && trimmedDescription.length > 0 && !submit.isPending && !showFallback;

  const result = submit.data;
  const submitError = result && !result.ok ? (result.error ?? cliHint(result.cli)) : null;

  const onSubmit = () => {
    if (!canSubmit) return;
    submit.mutate({
      title: trimmedTitle,
      body: composeIssueBody(description, bundle.text),
      kind,
    });
  };

  const close = () => {
    submit.reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Report an issue" size="md" testId="report-issue-dialog">
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
            <button
              type="button"
              onClick={() => openExternal(NEW_ISSUE_URL)}
              className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              <LuExternalLink aria-hidden className="h-3.5 w-3.5" />
              Open in browser instead
            </button>
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
                  openExternal(result.url as string);
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
          <p role="alert" className="text-xs text-destructive">
            {submitError}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {result?.ok ? 'Close' : 'Cancel'}
          </button>
          {!showFallback && !result?.ok ? (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submit.isPending ? (
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
    </Modal>
  );
}

/** `gh`'s own hint when it has one; a generic sentence per unready reason otherwise. */
function cliHint(cli: { reason: string; hint: string } | undefined): string {
  if (!cli) return 'The GitHub CLI could not be reached.';
  if (cli.hint.length > 0) return cli.hint;
  return cli.reason === 'not-installed'
    ? 'The GitHub CLI (gh) is not installed.'
    : 'The GitHub CLI is not signed in.';
}
