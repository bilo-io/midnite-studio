import type { BlameCommit, BlameLine, BlameResult } from '@midnite/git-shared';

/**
 * Parse `git blame --porcelain` output into BlameResult.
 *
 * Porcelain blame is newline-oriented rather than NUL-oriented — this exception is git's own format.
 *
 * Format:
 * `<sha> <origLine> <finalLine> [<numLines>]`
 * followed by key-value headers (author, author-mail, author-time, summary, previous, filename, etc.)
 * terminating with a tab-prefixed content line:
 * `\t<content>`
 *
 * Subsequent hunks for an already-seen commit do not re-emit all author metadata headers.
 */
export function parseBlame(payload: string, relPath: string, rev?: string | null): BlameResult {
  const lines = payload.split('\n');
  const commits: Record<string, BlameCommit> = {};
  const blameLines: BlameLine[] = [];

  let currentSha = '';
  let currentOrigLine = 0;
  let currentFinalLine = 0;
  let currentPrevious: { sha: string; path: string } | null = null;

  let authorName = '';
  let authorEmail = '';
  let authorTime = 0;
  let summary = '';

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw === undefined) continue;

    if (raw.startsWith('\t')) {
      const text = raw.slice(1);
      blameLines.push({
        sha: currentSha,
        origLine: currentOrigLine,
        finalLine: currentFinalLine,
        text,
        previous: currentPrevious,
      });
      // Advance lines
      currentOrigLine += 1;
      currentFinalLine += 1;
      continue;
    }

    if (raw.length === 0) continue;

    // Header line: 40-char sha followed by numbers
    const match = /^([0-9a-f]{40})\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/.exec(raw);
    if (match) {
      currentSha = match[1] ?? '';
      currentOrigLine = Number.parseInt(match[2] ?? '0', 10);
      currentFinalLine = Number.parseInt(match[3] ?? '0', 10);
      currentPrevious = null;
      continue;
    }

    // Key-value headers
    if (raw.startsWith('author ')) {
      authorName = raw.slice('author '.length).trim();
    } else if (raw.startsWith('author-mail ')) {
      authorEmail = raw.slice('author-mail '.length).replace(/^<|>$/g, '').trim();
    } else if (raw.startsWith('author-time ')) {
      authorTime = Number.parseInt(raw.slice('author-time '.length), 10) || 0;
    } else if (raw.startsWith('summary ')) {
      summary = raw.slice('summary '.length);
      if (currentSha && !commits[currentSha]) {
        commits[currentSha] = {
          sha: currentSha,
          authorName,
          authorEmail,
          authorTime,
          summary,
        };
      }
    } else if (raw.startsWith('previous ')) {
      const prevParts = raw.slice('previous '.length).split(/\s+/);
      const prevSha = prevParts[0];
      const prevPath = prevParts.slice(1).join(' ');
      if (prevSha && prevPath) {
        currentPrevious = { sha: prevSha, path: prevPath };
      }
    }
  }

  // Handle uncommitted lines if commit record wasn't populated
  for (const line of blameLines) {
    if (line.sha === '0000000000000000000000000000000000000000' && !commits[line.sha]) {
      commits[line.sha] = {
        sha: line.sha,
        authorName: 'Not Committed Yet',
        authorEmail: '',
        authorTime: Math.floor(Date.now() / 1000),
        summary: 'Not Committed Yet',
      };
    }
  }

  return {
    relPath,
    rev: rev ?? null,
    commits,
    lines: blameLines,
  };
}
