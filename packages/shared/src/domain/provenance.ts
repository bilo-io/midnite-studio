import { z } from 'zod';

import type { AgentSignature } from '../terminal';
import type { Commit } from './commit';
import type { ClosedSession } from './session-history';

/**
 * The mechanism that established a commit's provenance (Phase 78 Theme B).
 *
 * Ordered by confidence, strongest first:
 * 1. `session-trailer` — explicit `Midnite-Session:` trailer stamped during an agent session.
 * 2. `co-author` — `Co-Authored-By:` trailer matching an agent's registered email or name.
 * 3. `author` — commit author itself matches an agent's registered email or name.
 * 4. `session-window` — heuristic join: `committerDate ∈ [createdAt, closedAt]` on the same repo.
 */
export const ProvenanceSourceSchema = z.enum([
  'session-trailer',
  'co-author',
  'author',
  'session-window',
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;

/**
 * Provenance classification for a commit.
 *
 * - `human`: committed by a human with no agent trailers or session overlap.
 * - `agent`: authored or made by an agent CLI (or stamped with an agent session).
 * - `mixed`: human author with an agent co-author (e.g. standard Claude Code commit).
 */
export const CommitProvenanceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('human'),
  }),
  z.object({
    kind: z.literal('agent'),
    agentIds: z.array(z.string()),
    source: ProvenanceSourceSchema,
    sessionId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('mixed'),
    agentIds: z.array(z.string()),
    source: ProvenanceSourceSchema,
    sessionId: z.string().optional(),
  }),
]);
export type CommitProvenance = z.infer<typeof CommitProvenanceSchema>;

/**
 * Extract name and email from an identity or trailer string like
 * `Name <email>`, `<email>`, `email@domain.com`, or `Name`.
 */
export function extractIdentity(raw: string): { name: string; email: string } {
  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angleMatch && angleMatch[1] !== undefined && angleMatch[2] !== undefined) {
    return { name: angleMatch[1].trim(), email: angleMatch[2].trim() };
  }
  if (trimmed.includes('@')) {
    return { name: '', email: trimmed };
  }
  return { name: trimmed, email: '' };
}

/**
 * Check if a name and email match an agent signature.
 * Case-insensitive comparison across both emails and names.
 */
function matchesSignature(name: string, email: string, sig: AgentSignature): boolean {
  const lowerEmail = email.toLowerCase();
  const lowerName = name.toLowerCase();

  if (lowerEmail && sig.emails.some((e) => e.toLowerCase() === lowerEmail)) {
    return true;
  }
  if (lowerName && sig.names.some((n) => n.toLowerCase() === lowerName)) {
    return true;
  }
  return false;
}

/**
 * Find all agentIds in the roster that match the given name or email.
 */
function findMatchingAgents(
  name: string,
  email: string,
  roster: readonly AgentSignature[],
): string[] {
  const matched: string[] = [];
  for (const sig of roster) {
    if (matchesSignature(name, email, sig)) {
      matched.push(sig.agentId);
    }
  }
  return matched;
}

/**
 * Classify a commit's provenance against the agent roster and known closed sessions.
 *
 * Evaluation order:
 * 1. `session-trailer` (strongest) — resolves `Midnite-Session` trailer to an agent session.
 * 2. `co-author` — `Co-Authored-By` trailer matches a roster signature.
 * 3. `author` — commit author matches a roster signature.
 * 4. `session-window` (heuristic) — committerDate falls inside an agent session's window.
 * 5. Fallback: `{ kind: 'human' }`.
 */
export function classifyProvenance(
  commit: Commit,
  roster: readonly AgentSignature[],
  sessions: readonly ClosedSession[],
  repoId?: string,
): CommitProvenance {
  // Check if commit author matches an agent signature in the roster.
  const authorAgentIds = findMatchingAgents(commit.authorName, commit.authorEmail, roster);
  const isAuthorAgent = authorAgentIds.length > 0;

  // 1. Session trailer: explicit `Midnite-Session:` trailer that resolves to a known agent session.
  if (commit.sessionTrailers && commit.sessionTrailers.length > 0) {
    const matchedSessions: ClosedSession[] = [];
    for (const trailer of commit.sessionTrailers) {
      const session = sessions.find((s) => s.id === trailer);
      if (session && session.kind === 'agent' && session.agentId) {
        matchedSessions.push(session);
      }
    }
    const firstSession = matchedSessions[0];
    if (firstSession) {
      const agentIds = Array.from(new Set(matchedSessions.map((s) => s.agentId!)));
      return {
        kind: 'agent',
        agentIds,
        source: 'session-trailer',
        sessionId: firstSession.id,
      };
    }
  }

  // 2. Co-author: `Co-Authored-By` trailer matches a roster signature.
  if (commit.coAuthors && commit.coAuthors.length > 0) {
    const matchedAgentIds: string[] = [];
    for (const raw of commit.coAuthors) {
      const { name, email } = extractIdentity(raw);
      const ids = findMatchingAgents(name, email, roster);
      for (const id of ids) {
        if (!matchedAgentIds.includes(id)) {
          matchedAgentIds.push(id);
        }
      }
    }
    if (matchedAgentIds.length > 0) {
      return {
        kind: isAuthorAgent ? 'agent' : 'mixed',
        agentIds: matchedAgentIds,
        source: 'co-author',
      };
    }
  }

  // 3. Author: commit's own author matches a roster signature (committing as itself).
  if (isAuthorAgent) {
    return {
      kind: 'agent',
      agentIds: authorAgentIds,
      source: 'author',
    };
  }

  // 4. Session window: commit committerDate falls inside an agent session on the same repo.
  const targetRepoId = repoId ?? (commit as { repoId?: string }).repoId;
  const matchingWindowSessions: ClosedSession[] = [];

  for (const session of sessions) {
    // Only agent sessions count.
    if (session.kind !== 'agent' || !session.agentId) {
      continue;
    }
    // If repoId is specified, session must be on the same repo.
    if (targetRepoId !== undefined && session.repoId !== targetRepoId) {
      continue;
    }

    // Normalize timestamps: if > 1e11, timestamps are in ms; otherwise seconds.
    const startSec =
      session.createdAt > 1e11 ? Math.floor(session.createdAt / 1000) : session.createdAt;
    const endSec =
      session.closedAt > 1e11 ? Math.ceil(session.closedAt / 1000) : session.closedAt;

    if (commit.committerDate >= startSec && commit.committerDate <= endSec) {
      matchingWindowSessions.push(session);
    }
  }

  const firstWindowSession = matchingWindowSessions[0];
  if (firstWindowSession) {
    const agentIds = Array.from(new Set(matchingWindowSessions.map((s) => s.agentId!)));
    return {
      kind: 'agent',
      agentIds,
      source: 'session-window',
      ...(matchingWindowSessions.length === 1 ? { sessionId: firstWindowSession.id } : {}),
    };
  }

  // Default: human.
  return { kind: 'human' };
}

/**
 * Inverse join: find all commits attributed to a specific closed session.
 * Matches either via `Midnite-Session` trailer or session-window timestamp join.
 */
export function commitsForSession(
  commits: readonly Commit[],
  session: ClosedSession,
): Commit[] {
  if (session.kind !== 'agent' || !session.agentId) return [];

  const startSec =
    session.createdAt > 1e11 ? Math.floor(session.createdAt / 1000) : session.createdAt;
  const endSec =
    session.closedAt > 1e11 ? Math.ceil(session.closedAt / 1000) : session.closedAt;

  return commits.filter((commit) => {
    // 1. Direct session trailer match
    if (commit.sessionTrailers?.includes(session.id)) {
      return true;
    }
    // 2. Window join match
    const targetRepoId = (commit as { repoId?: string }).repoId;
    if (targetRepoId !== undefined && targetRepoId !== session.repoId) {
      return false;
    }
    return commit.committerDate >= startSec && commit.committerDate <= endSec;
  });
}
