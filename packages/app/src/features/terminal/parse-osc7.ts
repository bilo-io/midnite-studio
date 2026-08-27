/**
 * The payload of an OSC 7 sequence — `ESC ] 7 ; file://<host>/<path> BEL` —
 * as a local absolute path, or `null` if it does not name one.
 *
 * OSC 7 is how a shell announces its working directory to its terminal. The
 * host segment is the part that matters and the part that is easy to skip:
 * inside `ssh`, a remote shell emits OSC 7 for a path on the *remote* machine,
 * and a parser that ignores the host would hand the header a local path that
 * the terminal is not in — naming a repository confidently and wrongly. So the
 * host must be empty, `localhost`, or this machine.
 *
 * Everything else is rejected rather than guessed at: a wrong path is worse
 * than no path, which is the same posture `activity-detect.ts` arrived at the
 * hard way. A session whose shell never emits the sequence, or emits one we
 * refuse, simply keeps the cwd it was opened at.
 */
export function parseOsc7(payload: string, hostname?: string | null): string | null {
  if (!payload.startsWith('file://')) return null;

  const rest = payload.slice('file://'.length);
  // The host runs to the first `/`, which also begins the path. A payload with
  // no `/` at all carries a host and no path, and names nothing.
  const slash = rest.indexOf('/');
  if (slash < 0) return null;

  const host = rest.slice(0, slash).toLowerCase();
  if (!isLocalHost(host, hostname)) return null;

  const path = decodePath(rest.slice(slash));
  if (path === null) return null;

  /*
    A `..` segment is refused rather than resolved. `$PWD` is normally already
    normalised, so this is rare — but `resolveRepoForPath` matches on string
    prefixes, and `/Dev/midnite-git/../other` prefix-matches `midnite-git` and
    would label the header with a repository the shell has just left. Refusing
    costs that session its live path; guessing costs it the truth.
  */
  if (path === '..' || path.startsWith('../') || path.endsWith('/..') || path.includes('/../')) {
    return null;
  }

  // A trailing slash is legal and means the same directory; normalising it
  // here keeps it out of every comparison downstream.
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

/**
 * Empty and `localhost` are the two spellings of "no host". A real hostname is
 * accepted only when it is this machine's, in full or as the short form of it —
 * a shell commonly emits `$HOST` where `os.hostname()` is fully qualified
 * (`mac` vs `mac.local`), and vice versa.
 *
 * Deliberately NOT a first-label-to-first-label comparison, which is the
 * tempting shape and far too loose: it would accept `mac.attacker.example` as
 * this machine, and `127.0.0.2` as `127.0.0.1`. One side has to match the other
 * in full.
 */
function isLocalHost(host: string, hostname: string | null | undefined): boolean {
  if (host === '' || host === 'localhost') return true;
  if (!hostname) return false;

  const own = hostname.toLowerCase();
  return host === own || host === firstLabel(own) || firstLabel(host) === own;
}

const firstLabel = (value: string): string => value.split('.')[0] ?? value;

/**
 * Percent-decoding, which throws on a malformed escape rather than returning
 * anything — `decodeURIComponent('%')` is a `URIError`, and a shell mid-write
 * can emit a truncated sequence.
 */
function decodePath(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
