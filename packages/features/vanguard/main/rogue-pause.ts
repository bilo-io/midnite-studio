import { randomUUID } from 'node:crypto';

import type { AgentPausePrompt, SecurityFindingSeverity } from '@midnite/studio-shared';

/**
 * Auto-pause (Phase 120 Theme G). A finding whose severity the user has opted in (default: `critical` only)
 * interrupts its session and puts a resume-or-kill modal in front of the user in every window.
 *
 * It does exactly two things: the interrupt, through the one injected seam Phase 121 F's breaker and Theme H's
 * `pause-session` action share (Studio binds all three to the same Ctrl+C pty write), and the announcement.
 * It writes nothing else to the pty and ends nothing until the user answers **kill**. One open prompt per
 * session: a second finding while the first is unanswered does not interrupt again.
 */
export interface AutoPauseDeps {
  /** The severities that pause, read per finding so a Settings change applies at once. */
  severities: () => readonly SecurityFindingSeverity[];
  /** Ctrl+C to the session's pty; false when it is not live. */
  interrupt: (sessionId: string) => Promise<boolean>;
  /** End the session; the "kill" answer. */
  kill?: (sessionId: string) => Promise<boolean>;
  /** Show the modal in every window. */
  announce: (prompt: AgentPausePrompt) => void;
  now?: () => number;
  /** How long an unanswered prompt holds its session before a new finding may pause it again. Default 10 min. */
  latchMs?: number;
  onError?: (error: unknown) => void;
}

export interface AutoPause {
  /** Pause if the finding's severity is opted in. Returns the prompt, or null when nothing was paused. */
  onFinding(finding: {
    sessionId: string;
    severity: SecurityFindingSeverity;
    title: string;
    detail: string;
    findingId?: string;
  }): Promise<AgentPausePrompt | null>;
  /** The modal's answer. False when it was already answered or is unknown. */
  resolve(id: string, action: 'resume' | 'kill'): Promise<boolean>;
}

export function createAutoPause(deps: AutoPauseDeps): AutoPause {
  const now = deps.now ?? Date.now;
  const open = new Map<string, AgentPausePrompt>();
  const latchMs = deps.latchMs ?? 600_000;
  /** session id -> its open prompt's id. */
  const sessionOpen = new Map<string, string>();
  return {
    async onFinding(finding) {
      if (!deps.severities().includes(finding.severity)) return null;
      const held = sessionOpen.get(finding.sessionId);
      const heldPrompt = held === undefined ? undefined : open.get(held);
      // An unanswered prompt (no window was open, or it was ignored) must not leave the session unwatched forever.
      if (heldPrompt && now() - heldPrompt.at <= latchMs) return null;
      if (held !== undefined) open.delete(held);
      let interrupted = false;
      try {
        interrupted = await deps.interrupt(finding.sessionId);
      } catch (error) {
        deps.onError?.(error);
      }
      const prompt: AgentPausePrompt = {
        id: randomUUID(),
        sessionId: finding.sessionId,
        ...(finding.findingId ? { findingId: finding.findingId } : {}),
        severity: finding.severity,
        title: finding.title,
        detail: interrupted ? finding.detail : `${finding.detail} The session could not be reached to interrupt it.`,
        at: now(),
      };
      open.set(prompt.id, prompt);
      sessionOpen.set(finding.sessionId, prompt.id);
      try {
        deps.announce(prompt);
      } catch (error) {
        deps.onError?.(error);
      }
      return prompt;
    },
    async resolve(id, action) {
      const prompt = open.get(id);
      if (!prompt) return false;
      open.delete(id);
      if (sessionOpen.get(prompt.sessionId) === id) sessionOpen.delete(prompt.sessionId);
      if (action === 'kill') {
        try {
          await deps.kill?.(prompt.sessionId);
        } catch (error) {
          deps.onError?.(error);
        }
      }
      return true;
    },
  };
}
