import { LuShieldAlert, LuSparkles, LuSquare } from 'react-icons/lu';

import { agentSessionStore, useAgentSession } from '../agent-session-store';

const REASON_TITLE: Record<string, string> = {
  'cross-origin': 'Leave the allowed sites?',
  'password-field': 'Type into a password field?',
  'form-submit': 'Submit a form?',
  download: 'Download a file?',
};

/**
 * The strip above the page while an agent drives a tab (Phase 117 Theme G). It names the goal and
 * the sites the session may use, and it is where the session asks: leaving those sites, typing into a
 * password field, submitting a form and any download all pause here until the user answers.
 */
export function AgentSessionBar() {
  const session = useAgentSession((s) => s.session);
  const notice = useAgentSession((s) => s.notice);
  if (!session) {
    if (!notice) return null;
    return (
      <div role="status" className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="truncate">{notice}</span>
        <button
          type="button"
          onClick={() => agentSessionStore.setState({ notice: null })}
          className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium hover:bg-accent hover:text-foreground"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const pending = session.pending;
  const lastLine = session.log[session.log.length - 1];
  const sites = session.allowlist.map((o) => o.replace(/^https?:\/\//, '')).join(', ');

  return (
    <div
      role="region"
      aria-label="Agent Driving Session"
      className="flex shrink-0 flex-col border-b border-[var(--browser-accent)]/30 bg-[var(--browser-accent)]/10 text-xs"
    >
      <div className="flex items-center justify-between px-3 py-1.5">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="flex h-5 items-center gap-1.5 rounded bg-[var(--browser-accent)]/20 px-2 font-mono text-[11px] font-semibold text-[var(--browser-accent)]">
            <LuSparkles aria-hidden className="h-3 w-3" />
            <span>AGENT DRIVING</span>
          </span>
          <span className="truncate font-medium">Goal: {session.goal}</span>
          <span className="truncate text-muted-foreground" title={session.allowlist.join('\n')}>
            · Only on {sites}
          </span>
          {lastLine && !pending ? <span className="truncate text-muted-foreground">· {lastLine}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => agentSessionStore.getState().stop()}
          className="flex shrink-0 items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-accent"
        >
          <LuSquare aria-hidden className="h-3 w-3" />
          <span>Take Over</span>
        </button>
      </div>
      {pending ? (
        <div
          role="alertdialog"
          aria-label="The agent needs you"
          className="flex items-center justify-between gap-3 border-t border-[var(--browser-accent)]/30 bg-card/80 px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2">
            <LuShieldAlert aria-hidden className="h-4 w-4 shrink-0 text-[var(--browser-accent)]" />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{REASON_TITLE[pending.reason] ?? 'The agent needs you'}</p>
              <p className="truncate text-muted-foreground">{pending.summary}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => agentSessionStore.getState().respond('deny')}
              className="rounded border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={() => agentSessionStore.getState().respond('allow')}
              className="rounded bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              Allow once
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
