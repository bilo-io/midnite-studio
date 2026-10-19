import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, sep } from 'node:path';

import { BrowserWindow, shell } from 'electron';

import { CHANNELS, schemas } from '@midnite/studio-shared';

import { getClaudeInfo, runClaudeUpdate } from '../claude-cli';
import { claudeHome } from '../fs-scope';
import { handle, handleBare } from './handle';

/**
 * Which renderer-supplied absolute paths may be revealed (Phase 91 Theme E). The channel is the
 * Agent page's "reveal the CLI" button, and the CLI may live anywhere (`~/.local/bin`, Homebrew,
 * an npm prefix) — so the root-jail `fs-handlers.ts` uses cannot be one fixed root here. What the
 * channel is *for* is an agent's executable, or a file inside `~/.claude`; anything else (a
 * directory, a data file such as `~/.ssh/id_ed25519`, a path that does not exist) is refused.
 */
export async function isRevealablePath(path: string): Promise<boolean> {
  if (!isAbsolute(path) || path.includes('\0')) return false;
  let real: string;
  try {
    real = await realpath(path);
  } catch {
    return false;
  }
  try {
    const home = await realpath(claudeHome());
    if (real === home || real.startsWith(home + sep)) return true;
  } catch {
    // no ~/.claude: fall through to the executable test
  }
  try {
    const info = await stat(real);
    return info.isFile() && (info.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** The Agent settings page's invokes: probe the CLI, run update, reveal in Finder. */
export function registerClaudeHandlers(getWindow: () => BrowserWindow | null): void {
  handleBare(CHANNELS.agentClaudeInfo, () => getClaudeInfo());
  handleBare(CHANNELS.agentClaudeUpdate, () => runClaudeUpdate(getWindow));
  handle(
    CHANNELS.agentRevealPath,
    schemas.AgentRevealPathRequest,
    async ({ path }) => {
      if (!(await isRevealablePath(path))) return { ok: false, message: 'path cannot be revealed' };
      shell.showItemInFolder(path);
      return { ok: true };
    },
    (issue) => ({ ok: false, message: issue }),
  );
}

