/**
 * Making a crash record safe to paste in public — Phase 65 Theme B.
 *
 * Every record this app writes is destined for two places it did not used to
 * reach: a file on disk a user can hand over whole, and the clipboard, on its
 * way to an issue in the **public** `bilo-io/midnite-apps` tracker. A stack
 * trace is full of absolute paths, and an absolute path on a developer machine
 * carries a username and the name of every repository beside it.
 *
 * So redaction runs on the way IN — records are redacted as they are written,
 * not only as they are copied — and it lives here, in `shared`, because both
 * the main-side writer and any future renderer-side display need the identical
 * function. It depends on nothing but a home-directory string, which is why it
 * can live in a package that may import neither `electron` nor `node:os`.
 *
 * Deliberately conservative about what it does NOT touch: a commit sha, a
 * branch name and a relative path all survive intact, because a report with
 * those scrubbed out is a report nobody can act on.
 */

/** The placeholder every home directory collapses to. */
const HOME_TOKEN = '~';

/** What a redacted secret looks like in the output. */
const SECRET_TOKEN = '<redacted>';

/**
 * Credential shapes worth catching by pattern.
 *
 * These are the ones that actually turn up in this app's own error paths — a
 * `gh auth token` echoed into a git remote's stderr, an `Authorization` header
 * in a fetch failure, a JWT in a forge response. The list is allow-listed
 * rather than heuristic on purpose: a generic "long random-looking string" rule
 * would eat every commit sha in the record, and a stack trace without shas is
 * not worth keeping.
 */
const SECRET_PATTERNS: RegExp[] = [
  // GitHub tokens: classic PAT, OAuth, user-to-server, server-to-server, refresh.
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  // GitHub fine-grained PAT.
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  // Anthropic / OpenAI style keys.
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g,
  // Slack.
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  // A bearer credential in a header echoed into a message.
  /\b(?:Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{12,}/gi,
  // JWTs — three base64url segments.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
];

/**
 * A credential embedded in a URL: `https://user:secret@host/…`.
 *
 * Kept out of {@link SECRET_PATTERNS} because it is the one pattern with a
 * capture group — the scheme is worth keeping, so the report still says which
 * remote failed.
 */
const URL_CREDENTIAL = /(:\/\/)[^/\s:@]+:[^/\s@]+@/g;

/**
 * A home directory this process did not name, matched by shape.
 *
 * The explicit `homeDir` covers the machine the record was made on; this covers
 * the other paths that show up in the same stack — a second account's tree, a
 * path baked into a dependency at build time, a Windows path arriving in a
 * cross-platform stack. Each pattern stops at the separator, so `/Users/alice`
 * and `/Users/alice/x` both collapse without eating the `/x`.
 */
const FOREIGN_HOMES: RegExp[] = [
  /\/Users\/[^/\s:"']+/g,
  /\/home\/[^/\s:"']+/g,
  /[A-Za-z]:\\Users\\[^\\\s:"']+/g,
];

/**
 * Best-effort home directory when the caller does not name one.
 *
 * Read off `globalThis.process` rather than imported from `node:os`, because
 * this package may not import a node builtin (see CLAUDE.md's package
 * boundaries) and the same module is evaluated in the renderer, where `process`
 * does not exist at all. Callers in main pass `app.getPath('home')` explicitly
 * and never rely on this.
 */
function ambientHomeDir(): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  if (!env) return undefined;
  return env['HOME'] ?? env['USERPROFILE'] ?? undefined;
}

/** Escape a literal string for use inside a `RegExp`. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace the home directory with `~` and blank out credential-shaped strings.
 *
 * `homeDir` is optional: pass it from main (`app.getPath('home')`) so the
 * result does not depend on which process happened to call. Windows paths are
 * matched case-insensitively and separator-insensitively, since a stack can
 * carry `C:\Users\bo\…` and `C:/Users/bo/…` in the same string.
 */
export function redactPaths(text: string, homeDir?: string): string {
  if (text.length === 0) return text;
  let out = text;

  const home = homeDir ?? ambientHomeDir();
  if (home && home.length > 1) {
    const trimmed = home.replace(/[/\\]+$/, '');
    // Match either separator at every position, so a mixed-separator Windows
    // path collapses the same way a native one does.
    const pattern = escapeRegExp(trimmed).replace(/\\\\|\//g, '[/\\\\]');
    out = out.replace(new RegExp(pattern, 'gi'), HOME_TOKEN);
  }

  for (const pattern of FOREIGN_HOMES) {
    out = out.replace(pattern, HOME_TOKEN);
  }

  out = out.replace(URL_CREDENTIAL, `$1${SECRET_TOKEN}@`);

  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, SECRET_TOKEN);
  }

  return out;
}

/**
 * `redactPaths` over an object's string leaves, one level deep.
 *
 * The error-report payload is flat by construction (`ErrorReportSchema`), so a
 * recursive walk would be machinery with no second caller.
 */
export function redactRecord<T extends Record<string, unknown>>(record: T, homeDir?: string): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = typeof value === 'string' ? redactPaths(value, homeDir) : value;
  }
  return out as T;
}
