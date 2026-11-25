import { access, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseToml } from '@midnite/studio-runtime';
import { MCP_SERVER_NAME } from '@midnite/studio-shared';

/** The user's Codex MCP servers other than `midnite` (a dotted name included: #1713 addresses it too). */
export type CodexOtherMcpServers = { names: string[] };

export type CodexMcpServerSeams = {
  env?: NodeJS.ProcessEnv;
  home?: () => string;
  read?: (path: string) => Promise<string | null>;
  exists?: (path: string) => Promise<boolean>;
  realpath?: (path: string) => Promise<string>;
};

const readText = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const canonical = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Codex's default `project_root_markers`. */
const DEFAULT_ROOT_MARKERS = ['.git'];

/** `dir` and its ancestors, nearest first. */
function ancestors(dir: string): string[] {
  const out = [dir];
  for (let next = dirname(dir); next !== out[out.length - 1]; next = dirname(next)) out.push(next);
  return out;
}

/**
 * The project-layer directories Codex loads `.codex/config.toml` from, root first (#1718, checked against
 * codex 0.162): the project root is the nearest ancestor of `cwd` holding a `project_root_markers` entry
 * (default `.git`; none found, or an empty list, means `cwd` itself), and each directory from the root down
 * to `cwd` counts only when the nearest `[projects."<dir>"]` entry at or above it, stopping at the root, has
 * `trust_level = "trusted"`. An untrusted project adds nothing, so a name Codex never loaded is never
 * disabled (Codex fails the launch with `invalid transport` on one).
 */
async function trustedProjectDirs(
  cwd: string,
  user: Record<string, unknown>,
  exists: (path: string) => Promise<boolean>,
): Promise<string[]> {
  const rawMarkers = user['project_root_markers'];
  const markers = Array.isArray(rawMarkers)
    ? rawMarkers.filter((m): m is string => typeof m === 'string' && m !== '')
    : DEFAULT_ROOT_MARKERS;
  const chain = ancestors(cwd);
  let rootIndex = 0;
  if (markers.length > 0) {
    for (let i = 0; i < chain.length; i += 1) {
      const dir = chain[i] as string;
      const hits = await Promise.all(markers.map((m) => exists(join(dir, m))));
      if (hits.some(Boolean)) {
        rootIndex = i;
        break;
      }
    }
  }
  const projects = isRecord(user['projects']) ? user['projects'] : {};
  const trustOf = (dir: string): string | undefined => {
    const entry = Object.prototype.hasOwnProperty.call(projects, dir) ? projects[dir] : undefined;
    const level = isRecord(entry) ? entry['trust_level'] : undefined;
    return typeof level === 'string' ? level : undefined;
  };
  const layers: string[] = [];
  for (let i = rootIndex; i >= 0; i -= 1) {
    let level: string | undefined;
    for (let j = i; j <= rootIndex && level === undefined; j += 1) level = trustOf(chain[j] as string);
    if (level === 'trusted') layers.push(chain[i] as string);
  }
  return layers;
}

function serverNames(text: string | null): string[] {
  if (text === null) return [];
  const servers = parseToml(text)['mcp_servers'];
  return isRecord(servers) ? Object.keys(servers) : [];
}

/**
 * #1697: what a restricted Codex agent must turn off, since Codex has no `--strict-mcp-config`. Read only —
 * the user's Codex config is never written (Phase 115 Theme F) — from the files Codex itself layers:
 * `$CODEX_HOME/config.toml` (default `~/.codex`) and, for a project Codex trusts (#1718), each trusted
 * `<dir>/.codex/config.toml` from the project root down to `cwd`. A file that is missing or unreadable adds
 * nothing.
 */
export async function codexOtherMcpServers(cwd: string, seams: CodexMcpServerSeams = {}): Promise<CodexOtherMcpServers> {
  const env = seams.env ?? process.env;
  const read = seams.read ?? readText;
  const codexHome = env['CODEX_HOME']?.trim() || join((seams.home ?? homedir)(), '.codex');
  const userText = await read(join(codexHome, 'config.toml'));
  const user = userText === null ? {} : parseToml(userText);
  // Codex keys trust on the canonical path (`/private/tmp`, not `/tmp`, on macOS).
  const dir = await (seams.realpath ?? canonical)(cwd);
  const layers = await trustedProjectDirs(dir, user, seams.exists ?? pathExists);
  const projectTexts = await Promise.all(layers.map((d) => read(join(d, '.codex', 'config.toml'))));
  const all = new Set<string>();
  for (const text of [userText, ...projectTexts]) {
    for (const name of serverNames(text)) if (name !== MCP_SERVER_NAME) all.add(name);
  }
  return { names: [...all].sort() };
}
