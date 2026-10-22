import { isAbsolute, relative } from 'node:path';

/**
 * Best-effort attribution of an integrity change to an agent session (Phase 120 C).
 *
 * Vanguard runs unprivileged (no Endpoint Security client — Decision 1), so it cannot see which process
 * wrote a file. What it can see is which agent sessions were live when the write was noticed: the pty
 * sessions carrying the write-side fingerprint `pty-env.ts` puts in an agent pty's environment
 * (`MSTUDIO_SESSION_ID`/`MSTUDIO_AGENT_ID`), which every process descended from that pty inherits. A
 * session counts for a repo when it belongs to that repo or its cwd is inside it; for the home-dir
 * files, any live agent session counts. The finding says all of this is a correlation in time, not proof.
 */

export interface IntegrityLiveSession {
  sessionId: string;
  /** Set on an agent pty (the fingerprint's `MSTUDIO_AGENT_ID`); a plain shell has none. */
  agentId?: string;
  repoId?: string;
  cwd?: string;
  title?: string;
}

export interface IntegrityAttribution {
  sessions: IntegrityLiveSession[];
  /** One sentence for the finding's detail. */
  summary: string;
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const describe = (s: IntegrityLiveSession): string =>
  `${s.title ? `"${s.title}" ` : ''}(${s.agentId ?? 'agent'}, session ${s.sessionId})`;

export function attributeChange(
  sessions: readonly IntegrityLiveSession[],
  target: { scope: 'repo' | 'user'; repoId?: string; root: string },
  toolCall?: string,
): IntegrityAttribution {
  const seen = new Set<string>();
  const matched = sessions.filter((s) => {
    if (!s.agentId || seen.has(s.sessionId)) return false;
    const hit =
      target.scope === 'user' ||
      (target.repoId !== undefined && s.repoId === target.repoId) ||
      (s.cwd !== undefined && inside(target.root, s.cwd));
    if (hit) seen.add(s.sessionId);
    return hit;
  });
  const where = target.scope === 'user' ? 'on this machine' : 'in this repo';
  const call = toolCall ? ` The agent audit trail names the tool call: ${toolCall}.` : '';
  if (matched.length === 0) {
    return {
      sessions: [],
      summary: `No agent session was live ${where} when the change was seen, so it was made by hand or by something outside the suite.${call}`,
    };
  }
  const names = matched.map(describe).join(', ');
  const lead =
    matched.length === 1
      ? `Agent session ${names} was live ${where} when the change was seen`
      : `Agent sessions ${names} were live ${where} when the change was seen`;
  return {
    sessions: matched,
    summary: `${lead}. Attribution is best-effort: a correlation in time, not proof of which process wrote the file.${call}`,
  };
}
