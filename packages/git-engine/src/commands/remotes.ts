import type { Remote } from '@midnite/studio-shared';

import { execGit } from '../exec/git-exec';
import { parseRemoteUrl } from '../parsers/remote-url';

/**
 * Every configured remote, with its forge already derived.
 *
 * `git config --get-regexp` rather than `git remote -v`, for two reasons. The
 * porcelain prints `name<TAB>url (fetch)` — whitespace-delimited, with a
 * parenthesised suffix, and a URL may legally contain a space — so it has to be
 * split on a separator that is also valid inside a field. And `-z` makes the
 * config reader emit `key\nvalue\0` records, which is NUL-delimited framing the
 * porcelain has no equivalent of.
 *
 * Both `url` and `pushurl` are read in one pass. Git's own rule is that
 * `remote.<name>.pushurl` falls back to `remote.<name>.url` when unset, and
 * resolving that here beats making every reader remember it — a mirror setup
 * with a read-only fetch URL is exactly the case that gets it wrong.
 */
export async function listRemotes(repoPath: string): Promise<Remote[]> {
  const res = await execGit(repoPath, [
    'config',
    '-z',
    '--get-regexp',
    String.raw`^remote\..+\.(url|pushurl)$`,
  ]);

  // Exit 1 means "no key matched" — a repo with no remotes at all, which is a
  // normal state (a fresh `git init`), not a failure.
  if (res.exitCode !== 0) return [];

  return parseRemoteConfig(res.stdout);
}

/**
 * Parse `git config -z --get-regexp` output into remotes.
 *
 * Exported for its own unit test: the framing (`key\nvalue\0`) and the
 * name-extraction (a remote name may itself contain dots — `remote.my.fork.url`
 * is name `my.fork`) are the parts worth pinning down without a repo.
 */
export function parseRemoteConfig(payload: string): Remote[] {
  // Insertion-ordered so remotes come back in config-file order, which is what
  // `pickForgeRemote`'s "first known forge" tiebreak is defined against.
  const byName = new Map<string, { fetchUrl?: string; pushUrl?: string }>();

  for (const record of payload.split('\0')) {
    if (record.length === 0) continue;

    // The FIRST newline separates key from value; a value may contain more.
    const split = record.indexOf('\n');
    if (split === -1) continue;

    const key = record.slice(0, split);
    const value = record.slice(split + 1);
    if (value.length === 0) continue;

    // `remote.<name>.<field>` where <name> may contain dots — so peel the fixed
    // prefix and the fixed suffix rather than splitting on `.`.
    if (!key.startsWith('remote.')) continue;
    const rest = key.slice('remote.'.length);
    const lastDot = rest.lastIndexOf('.');
    if (lastDot <= 0) continue;

    const name = rest.slice(0, lastDot);
    const field = rest.slice(lastDot + 1);

    const entry = byName.get(name) ?? {};
    // A remote may carry several `url`/`pushurl` values (git supports multiple
    // push targets). The first wins — it is the one git reports as *the* URL,
    // and a second one is a push fan-out, not a different project.
    if (field === 'url' && entry.fetchUrl === undefined) entry.fetchUrl = value;
    if (field === 'pushurl' && entry.pushUrl === undefined) entry.pushUrl = value;
    byName.set(name, entry);
  }

  const remotes: Remote[] = [];
  for (const [name, { fetchUrl, pushUrl }] of byName) {
    // A `pushurl` with no `url` is a broken config; there is nothing to fetch
    // from, and every caller here treats fetchUrl as the identifying one.
    if (fetchUrl === undefined) continue;
    remotes.push({
      name,
      fetchUrl,
      pushUrl: pushUrl ?? fetchUrl,
      // Derived from the FETCH url: it is the one that identifies the project.
      // A pushurl can point at a mirror on a different host entirely.
      forge: parseRemoteUrl(fetchUrl),
    });
  }

  return remotes;
}
