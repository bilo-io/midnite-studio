import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { parseToml } from '@midnite/studio-runtime';
import { MCP_SERVER_NAME } from '@midnite/studio-shared';

/** The user's Codex MCP servers other than `midnite` (a dotted name included: #1713 addresses it too). */
export type CodexOtherMcpServers = { names: string[] };

export type CodexMcpServerSeams = {
  env?: NodeJS.ProcessEnv;
  home?: () => string;
  read?: (path: string) => Promise<string | null>;
};

const readText = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
};

/**
 * #1697: what a restricted Codex agent must turn off, since Codex has no `--strict-mcp-config`. Read only —
 * the user's Codex config is never written (Phase 115 Theme F) — from the two files Codex itself layers:
 * `$CODEX_HOME/config.toml` (default `~/.codex`) and the project's `<cwd>/.codex/config.toml`. A file that is
 * missing or unreadable adds nothing.
 */
export async function codexOtherMcpServers(cwd: string, seams: CodexMcpServerSeams = {}): Promise<CodexOtherMcpServers> {
  const env = seams.env ?? process.env;
  const read = seams.read ?? readText;
  const codexHome = env['CODEX_HOME']?.trim() || join((seams.home ?? homedir)(), '.codex');
  const texts = await Promise.all([read(join(codexHome, 'config.toml')), read(join(cwd, '.codex', 'config.toml'))]);
  const all = new Set<string>();
  for (const text of texts) {
    if (text === null) continue;
    const servers = parseToml(text)['mcp_servers'];
    if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
      for (const name of Object.keys(servers)) if (name !== MCP_SERVER_NAME) all.add(name);
    }
  }
  return { names: [...all].sort() };
}
