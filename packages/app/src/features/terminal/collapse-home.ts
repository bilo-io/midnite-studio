/**
 * `/Users/you/Dev/repo` → `~/Dev/repo`.
 *
 * String work on purpose: the renderer may not import `node:path` (see the
 * package boundaries in CLAUDE.md), and the home path it compares against
 * arrives from the preload as `bridge.homeDir`.
 *
 * The obvious implementation — `path.startsWith(home)` — is wrong in one
 * specific way, which is why this has tests: without a separator check
 * `/Users/bilolwabonaX/Dev` starts with `/Users/bilolwabona` and gets rewritten
 * to `~X/Dev`, silently claiming a *different* user's home as yours. The
 * boundary has to be the end of the string or a `/`.
 */
export function collapseHome(path: string, home: string | null | undefined): string {
  if (!path || !home) return path;

  // A trailing slash on the home path would otherwise make every comparison
  // below off by one — `/Users/you/` never prefixes `/Users/you`.
  const root = home.endsWith('/') && home.length > 1 ? home.slice(0, -1) : home;

  if (path === root) return '~';
  if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`;
  return path;
}
