import { useCallback, useEffect, useState } from 'react';
import { LuShieldQuestion } from 'react-icons/lu';

import type { ToolApprovalDecision, ToolApprovalRequest } from '@midnite/studio-shared';

import { bridge } from '../bridge';

const ORIGIN_LABEL: Record<string, string> = {
  user: 'you',
  'repo-file': 'a repository file',
  attachment: 'an attachment',
  forge: 'a pull request, issue or check',
  'web-page': 'a web page',
  'mcp-result': 'a tool result',
  'agent-output': 'another agent',
  clipboard: 'pasted text',
};

/**
 * One approval card (Phase 121 Theme B): a tool call the policy will not wave through, and the three ways to
 * answer it. It shows the tool, its arguments (already scrubbed in main), where any untrusted input that reached
 * an argument came from, and the rule that fired. One card is one call: there is no "approve all".
 */
export function ToolApprovalCard({
  request,
  position,
  total,
  onAnswer,
  busy = false,
}: {
  request: ToolApprovalRequest;
  /** 1-based place in the queue, with `total`, when more than one is waiting. */
  position?: number;
  total?: number;
  onAnswer: (decision: ToolApprovalDecision) => void;
  busy?: boolean;
}) {
  const button = 'rounded border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50';
  return (
    <section
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={`tool-approval-${request.id}`}
      data-testid="tool-approval-card"
      className="pointer-events-auto flex w-[min(480px,calc(100vw-2rem))] flex-col gap-2 rounded-lg border border-amber-500/50 bg-popover p-3 text-xs shadow-xl"
    >
      <header className="flex items-start gap-2">
        <LuShieldQuestion aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <h2 id={`tool-approval-${request.id}`} className="text-sm font-semibold text-foreground">
            An agent wants to call <code className="font-mono">{request.tool}</code>
          </h2>
          <p data-testid="tool-approval-reason" className="mt-0.5 text-muted-foreground">
            {request.reason}
          </p>
        </div>
        {total !== undefined && total > 1 ? (
          <span data-testid="tool-approval-queue" className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {position ?? 1} of {total}
          </span>
        ) : null}
      </header>

      {request.provenance.length > 0 ? (
        <div data-testid="tool-approval-provenance" className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-foreground">
          <p className="font-medium">Untrusted input reached this call</p>
          <ul className="mt-0.5 list-disc pl-4">
            {request.provenance.map((p) => (
              <li key={`${p.origin}:${p.ref}`}>
                from {ORIGIN_LABEL[p.origin] ?? p.origin}
                {p.ref ? <span className="font-mono text-muted-foreground"> ({p.ref})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">Arguments (secrets removed)</p>
        <pre data-testid="tool-approval-args" className="max-h-40 overflow-auto rounded bg-muted/60 p-2 font-mono text-[11px] leading-snug">
          {request.args}
        </pre>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Rule <code className="font-mono">{request.ruleId}</code>
        {request.repoPath ? <> in <code className="font-mono">{request.repoPath}</code></> : null}. Denied automatically if unanswered.
      </p>

      <footer className="flex flex-wrap justify-end gap-1.5">
        <button type="button" className={button} disabled={busy} onClick={() => onAnswer('deny')}>
          Deny
        </button>
        <button type="button" className={button} disabled={busy} onClick={() => onAnswer('approve-session')}>
          Approve for this session
        </button>
        <button
          type="button"
          className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={busy}
          onClick={() => onAnswer('approve-once')}
        >
          Approve once
        </button>
      </footer>
    </section>
  );
}

/**
 * The queue behind the card: requests main pushes to this window, oldest first, and the answer path back. A card
 * answered in another window (or timed out) is dropped here when main says so.
 */
export function useToolApprovalQueue(): { queue: ToolApprovalRequest[]; answer: (id: string, decision: ToolApprovalDecision) => void } {
  const [queue, setQueue] = useState<ToolApprovalRequest[]>([]);
  useEffect(() => {
    const api = bridge()?.toolApproval;
    if (!api) return undefined;
    const offRequested = api.onRequested((request) => setQueue((q) => (q.some((r) => r.id === request.id) ? q : [...q, request])));
    const offResolved = api.onResolved(({ id }) => setQueue((q) => q.filter((r) => r.id !== id)));
    return () => {
      offRequested();
      offResolved();
    };
  }, []);
  const answer = useCallback((id: string, decision: ToolApprovalDecision) => {
    // Drop the card at once; a stale answer (already answered elsewhere) changes nothing in main.
    setQueue((q) => q.filter((r) => r.id !== id));
    void bridge()
      ?.toolApproval.answer({ id, decision })
      .catch(() => undefined);
  }, []);
  return { queue, answer };
}

/** Mounted once at the app root: shows the oldest waiting card, bottom-right, over everything. */
export function ToolApprovalHost() {
  const { queue, answer } = useToolApprovalQueue();
  const head = queue[0];
  if (!head) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-dialog flex" data-testid="tool-approval-host">
      <ToolApprovalCard key={head.id} request={head} position={1} total={queue.length} onAnswer={(decision) => answer(head.id, decision)} />
    </div>
  );
}
