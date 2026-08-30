import type { BranchStatus, StatusCode, StatusEntry, StatusResult } from '@midnite/studio-shared';

/**
 * Parser for `git status --porcelain=v2 -z --branch --untracked-files=all`.
 *
 * v2 rather than v1 because v1 collapses information the UI needs: it has no
 * ahead/behind, no rename similarity score, and its unmerged states are
 * ambiguous. v2's line kinds:
 *
 *   `# branch.<field> …`  header lines (from --branch)
 *   `1 <XY> …  <path>`     ordinary change
 *   `2 <XY> …  <X><score> <path>\0<origPath>`  rename/copy — TWO NUL tokens
 *   `u <XY> …  <path>`     unmerged (conflict)
 *   `? <path>`             untracked
 *   `! <path>`             ignored
 *
 * The `-z` handling is the subtle part: records are NUL-*terminated*, and a
 * rename record deliberately contains an extra NUL because a path can contain
 * anything except NUL. So the token stream is not one-token-per-record — a `2`
 * record consumes the following token as its original path.
 */

/** `XY` status letters → the domain vocabulary. */
const CODE_BY_LETTER: Readonly<Record<string, StatusCode>> = {
  '.': 'unmodified',
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typeChanged',
  U: 'conflicted',
};

const toCode = (letter: string | undefined): StatusCode =>
  (letter !== undefined && CODE_BY_LETTER[letter]) || 'unmodified';

export function parseStatus(payload: string): StatusResult {
  // Trailing NUL from the last record produces an empty final token.
  const tokens = payload.split('\x00');

  const branch: BranchStatus = {
    head: null,
    oid: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    unborn: false,
    detached: false,
  };
  const entries: StatusEntry[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const line = tokens[i];
    if (line === undefined || line.length === 0) continue;

    const kind = line[0];

    if (kind === '#') {
      applyHeader(branch, line);
      continue;
    }

    if (kind === '1') {
      const entry = parseOrdinary(line);
      if (entry) entries.push(entry);
      continue;
    }

    if (kind === '2') {
      // The original path is the NEXT token — consume it.
      const origPath = tokens[i + 1] ?? '';
      i += 1;
      const entry = parseRename(line, origPath);
      if (entry) entries.push(entry);
      continue;
    }

    if (kind === 'u') {
      const entry = parseUnmerged(line);
      if (entry) entries.push(entry);
      continue;
    }

    if (kind === '?') {
      entries.push({
        path: line.slice(2),
        origPath: null,
        staged: 'unmodified',
        unstaged: 'untracked',
        conflicted: false,
        similarity: null,
      });
      continue;
    }

    if (kind === '!') {
      entries.push({
        path: line.slice(2),
        origPath: null,
        staged: 'unmodified',
        unstaged: 'ignored',
        conflicted: false,
        similarity: null,
      });
    }
  }

  return { branch, entries, inProgress: null };
}

function applyHeader(branch: BranchStatus, line: string): void {
  // `# branch.oid <value>` — the value may itself contain spaces (`(initial)`).
  const rest = line.slice(2);
  const space = rest.indexOf(' ');
  if (space < 0) return;
  const field = rest.slice(0, space);
  const value = rest.slice(space + 1);

  switch (field) {
    case 'branch.oid':
      if (value === '(initial)') {
        branch.unborn = true;
        branch.oid = null;
      } else {
        branch.oid = value;
      }
      break;
    case 'branch.head':
      if (value === '(detached)') {
        branch.detached = true;
        branch.head = null;
      } else {
        branch.head = value;
      }
      break;
    case 'branch.upstream':
      branch.upstream = value;
      break;
    case 'branch.ab': {
      // `+3 -1`
      const [aheadTok, behindTok] = value.split(' ');
      branch.ahead = Math.abs(Number.parseInt(aheadTok ?? '0', 10) || 0);
      branch.behind = Math.abs(Number.parseInt(behindTok ?? '0', 10) || 0);
      break;
    }
    default:
      break;
  }
}

/** `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>` */
function parseOrdinary(line: string): StatusEntry | null {
  const fields = splitFields(line, 8);
  if (!fields) return null;
  const xy = fields.head[1];
  return {
    path: fields.tail,
    origPath: null,
    staged: toCode(xy?.[0]),
    unstaged: toCode(xy?.[1]),
    conflicted: false,
    similarity: null,
  };
}

/** `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path>` (+ origPath token) */
function parseRename(line: string, origPath: string): StatusEntry | null {
  const fields = splitFields(line, 9);
  if (!fields) return null;
  const xy = fields.head[1];
  const scoreField = fields.head[8] ?? '';
  // `R100` / `C75` — the leading letter repeats the rename-vs-copy distinction.
  const similarity = Number.parseInt(scoreField.slice(1), 10);

  return {
    path: fields.tail,
    origPath,
    staged: toCode(xy?.[0]),
    unstaged: toCode(xy?.[1]),
    conflicted: false,
    similarity: Number.isNaN(similarity) ? null : similarity,
  };
}

/**
 * `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
 *
 * The XY of an unmerged entry encodes *which side* changed (`UU` both modified,
 * `AA` both added, `DU` deleted by us…). The UI only needs "this path is
 * conflicted", so both axes are flattened to `conflicted` and the raw letters
 * are not surfaced — the conflict banner lists paths, it doesn't classify them.
 */
function parseUnmerged(line: string): StatusEntry | null {
  const fields = splitFields(line, 10);
  if (!fields) return null;
  return {
    path: fields.tail,
    origPath: null,
    staged: 'conflicted',
    unstaged: 'conflicted',
    conflicted: true,
    similarity: null,
  };
}

/**
 * Split the first `count` space-delimited fields off a record and return the
 * untouched remainder as the path.
 *
 * Splitting the whole line on spaces would corrupt any path containing one —
 * and paths with spaces are the norm, not the exception.
 */
function splitFields(line: string, count: number): { head: string[]; tail: string } | null {
  const head: string[] = [];
  let cursor = 0;

  for (let i = 0; i < count; i += 1) {
    const space = line.indexOf(' ', cursor);
    if (space < 0) return null;
    head.push(line.slice(cursor, space));
    cursor = space + 1;
  }

  return { head, tail: line.slice(cursor) };
}
