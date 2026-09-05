import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Finds the running app's MCP socket without knowing its exact name.
 *
 * The socket's filename embeds a build fingerprint (`mcpSocketName`,
 * `main/socket-name.ts`) that the shim — a separate process with no view of
 * which build is currently running — has no independent way to compute. But
 * unlike the pty broker, the MCP server is not detached: it lives and dies
 * with the Electron main process, so there is no "legacy" peer from a
 * previous build still serving anything. At most one socket file under
 * `<userData>/mcp/` is ever actually live at a time; anything else is a dead
 * file a crashed run left unlinked. The most recently created one — freshest
 * `mtime` — is that live one.
 */
export function resolveMcpSocketPath(userDataDir: string): string | null {
  const dir = join(userDataDir, 'mcp');

  let entries: string[];
  try {
    entries = readdirSync(dir).filter((name) => name.endsWith('.sock'));
  } catch {
    return null;
  }
  if (entries.length === 0) return null;

  let newest: { path: string; mtimeMs: number } | null = null;
  for (const name of entries) {
    const path = join(dir, name);
    try {
      const mtimeMs = statSync(path).mtimeMs;
      if (!newest || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs };
    } catch {
      // Vanished between readdir and stat (a race with the server unlinking
      // a stale one) — not a candidate.
    }
  }
  return newest?.path ?? null;
}
