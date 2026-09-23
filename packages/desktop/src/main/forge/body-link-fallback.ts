import { parseBlockerRefs, type ForgeIssueRef } from '@midnite/studio-shared';

/**
 * The `Blocked by #N` body-text fallback (Phase 95 Theme D) — the one write
 * GitLab, Bitbucket and Azure DevOps share for `linkIssues`/`unlinkIssues`
 * `kind: 'blockedBy'`, since none of the three has a native dependency
 * mutation this app implements. Provider-agnostic on purpose: every caller
 * already has the issue's current body in hand (from its own `issueDetail`)
 * and an `editIssue`-shaped write to send the new one back through, so this
 * module only ever touches the text.
 *
 * The line it writes and reads is exactly what `parseBlockerRefs`
 * (`forge-graph.ts`, shared) already parses on read — `Blocked by #N` for the
 * board's own repo, `Blocked by owner/name#N` for a foreign one — so a link
 * written here shows up as an edge the very next time the board is read,
 * with no new grammar for that parser to learn.
 */

export interface BlockerRef {
  /** `''` for the board's own repo, `owner/name` for a foreign one — the same
   *  convention `ForgeIssueLink.repo` and `ForgeIssuesLinkRequest.targetRepo` use. */
  repo: string;
  number: number;
}

function canonicalLine(ref: BlockerRef): string {
  return ref.repo ? `Blocked by ${ref.repo}#${ref.number}` : `Blocked by #${ref.number}`;
}

function sameRef(a: ForgeIssueRef, b: BlockerRef): boolean {
  return a.number === b.number && a.repo.trim().toLowerCase() === b.repo.trim().toLowerCase();
}

/**
 * Appends the canonical `Blocked by …` line, unless `body` already carries a
 * reference to the same target — checked with the exact parser that reads it
 * back, so "already linked" can never silently duplicate the line.
 * `changed: false` on the already-linked case is what lets the caller skip
 * the write entirely and still report `ok: true`.
 */
export function withBlockedByLine(body: string, ref: BlockerRef): { body: string; changed: boolean } {
  if (parseBlockerRefs(body).some((existing) => sameRef(existing, ref))) {
    return { body, changed: false };
  }
  const line = canonicalLine(ref);
  const trimmed = body.replace(/\s+$/, '');
  return { body: trimmed.length > 0 ? `${trimmed}\n\n${line}` : line, changed: true };
}

/**
 * Removes exactly the line `withBlockedByLine` would have written for this
 * ref — a whole-line match, never a substring rewrite, so a paragraph that
 * happens to mention "blocked by" in prose is left untouched. `changed:
 * false` when no such line exists, the idempotent "already unlinked" case.
 */
export function withoutBlockedByLine(body: string, ref: BlockerRef): { body: string; changed: boolean } {
  const line = canonicalLine(ref);
  let changed = false;
  const kept = body.split('\n').filter((text) => {
    if (text.trim() === line) {
      changed = true;
      return false;
    }
    return true;
  });
  if (!changed) return { body, changed: false };

  const collapsed = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  return { body: collapsed, changed: true };
}
