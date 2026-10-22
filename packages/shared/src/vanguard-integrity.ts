import { z } from 'zod';

import type { SecurityFindingSeverity } from './security-findings';

/**
 * Vanguard's integrity sensor contract (Phase 120 Theme C): the files that decide what runs, each with
 * the reason it is watched, how a change to it is graded, and the baseline the sensor keeps on disk.
 *
 * The watched set lives here, in `shared`, so the Sensors tab can say *why* each path is watched without
 * reaching into the feature's main half. Everything below is pure: no node builtins, zod only.
 */

/** What a watched path is, which decides a change's severity. */
export const IntegrityClassSchema = z.enum([
  /** git hooks: run on every commit, checkout, merge or push. */
  'hooks',
  /** MCP server configuration: names programs an agent launches and talks to. */
  'mcp',
  /** An agent's own configuration: hooks, permissions, skills, commands. */
  'agent-config',
  /** `package.json` scripts: run by every install, build and test. */
  'scripts',
  /** Lockfiles: pin what an install downloads and runs. */
  'lockfile',
  /** Environment files: credentials and endpoints every process reads. */
  'env',
  /** Package-registry configuration: where installs come from and with which token. */
  'registry',
  /** Editor workspace configuration: tasks that run on folder open, interpreter paths. */
  'editor',
  /** Global git configuration: `core.hooksPath`, aliases, credential helpers. */
  'git-config',
]);
export type IntegrityClass = z.infer<typeof IntegrityClassSchema>;

/** Where a watched path is anchored. */
export const IntegrityBaseSchema = z.enum([
  /** The repo's working tree root. */
  'worktree',
  /** The repo's common git dir (`.git`, or the main checkout's `.git` for a linked worktree). */
  'git-dir',
  /** The user's home directory. */
  'home',
]);
export type IntegrityBase = z.infer<typeof IntegrityBaseSchema>;

/**
 * How a path is matched:
 * - `file`: exactly this path.
 * - `dir`: every file beneath this directory, at any depth.
 * - `prefix`: every file directly in the base whose name starts with this string (`.env`, `.env.local`).
 */
export type IntegrityMatchKind = 'file' | 'dir' | 'prefix';

/**
 * Which part of the file is hashed. `whole` hashes the bytes. The other two hash a canonical JSON of the
 * one part that decides what runs, so the churn around it is not a change: `package.json`'s version
 * bump or a new dependency is the lockfile's business, and `~/.claude.json` is rewritten by Claude Code
 * on every session for its own bookkeeping.
 */
export type IntegrityExtract = 'whole' | 'package-json-scripts' | 'claude-json-mcp';

export interface IntegrityWatchEntry {
  /** Stable id: part of a finding's fingerprint and the Sensors tab row. */
  id: string;
  scope: 'repo' | 'user';
  base: IntegrityBase;
  match: IntegrityMatchKind;
  /** POSIX path relative to `base`; for `prefix`, the name prefix. */
  path: string;
  class: IntegrityClass;
  extract: IntegrityExtract;
  /** One sentence the Sensors tab shows: why a change here matters. */
  reason: string;
}

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'Yarn'],
  ['Cargo.lock', 'Cargo'],
  ['poetry.lock', 'Poetry'],
  ['go.sum', 'Go modules'],
] as const;

/** The watched set — Phase 120 C's list, verbatim, with a reason per entry. */
export const INTEGRITY_WATCHED: readonly IntegrityWatchEntry[] = [
  // --- Per repo ------------------------------------------------------------
  {
    id: 'repo.claude',
    scope: 'repo',
    base: 'worktree',
    match: 'dir',
    path: '.claude',
    class: 'agent-config',
    extract: 'whole',
    reason: "Claude Code's project hooks, permissions, skills and commands; a hook here runs a shell command on every tool call.",
  },
  {
    id: 'repo.codex',
    scope: 'repo',
    base: 'worktree',
    match: 'dir',
    path: '.codex',
    class: 'agent-config',
    extract: 'whole',
    reason: "Codex's project config and skills; it decides which commands Codex may run without asking.",
  },
  {
    id: 'repo.agents',
    scope: 'repo',
    base: 'worktree',
    match: 'dir',
    path: '.agents',
    class: 'agent-config',
    extract: 'whole',
    reason: 'Agent-neutral skills and instructions every agent in the repo loads as trusted guidance.',
  },
  {
    id: 'repo.cursor',
    scope: 'repo',
    base: 'worktree',
    match: 'dir',
    path: '.cursor',
    class: 'mcp',
    extract: 'whole',
    reason: "Cursor's rules and mcp.json; an injected write to .cursor/mcp.json was CVE-2025-54135's route to code execution.",
  },
  {
    id: 'repo.mcp-json',
    scope: 'repo',
    base: 'worktree',
    match: 'file',
    path: '.mcp.json',
    class: 'mcp',
    extract: 'whole',
    reason: 'Project MCP servers: each entry is a program an agent launches, and a once-approved entry can be swapped later (CVE-2025-54136).',
  },
  {
    id: 'repo.githooks',
    scope: 'repo',
    base: 'worktree',
    match: 'dir',
    path: '.githooks',
    class: 'hooks',
    extract: 'whole',
    reason: 'Versioned git hooks (via core.hooksPath): they run on every commit, checkout and push.',
  },
  {
    id: 'repo.git-hooks',
    scope: 'repo',
    base: 'git-dir',
    match: 'dir',
    path: 'hooks',
    class: 'hooks',
    extract: 'whole',
    reason: 'Unversioned git hooks in .git/hooks: never reviewed, never committed, and they run on every git operation.',
  },
  {
    id: 'repo.vscode-settings',
    scope: 'repo',
    base: 'worktree',
    match: 'file',
    path: '.vscode/settings.json',
    class: 'editor',
    extract: 'whole',
    reason: 'Workspace settings can point the editor at another interpreter, terminal profile or formatter binary.',
  },
  {
    id: 'repo.vscode-tasks',
    scope: 'repo',
    base: 'worktree',
    match: 'file',
    path: '.vscode/tasks.json',
    class: 'editor',
    extract: 'whole',
    reason: 'Workspace tasks can run a command the moment the folder is opened (runOn: folderOpen).',
  },
  {
    id: 'repo.package-scripts',
    scope: 'repo',
    base: 'worktree',
    match: 'file',
    path: 'package.json',
    class: 'scripts',
    extract: 'package-json-scripts',
    reason: 'The scripts block runs on every install (preinstall/postinstall), build and test; only it is hashed.',
  },
  ...LOCKFILES.map(
    ([name, tool]): IntegrityWatchEntry => ({
      id: `repo.lock.${name}`,
      scope: 'repo',
      base: 'worktree',
      match: 'file',
      path: name,
      class: 'lockfile',
      extract: 'whole',
      reason: `The ${tool} lockfile pins exactly what an install downloads and runs; a swapped resolution is a supply-chain change.`,
    }),
  ),
  {
    id: 'repo.env',
    scope: 'repo',
    base: 'worktree',
    match: 'prefix',
    path: '.env',
    class: 'env',
    extract: 'whole',
    reason: 'Environment files hold credentials and endpoints; a changed endpoint quietly redirects what the app talks to.',
  },
  {
    id: 'repo.npmrc',
    scope: 'repo',
    base: 'worktree',
    match: 'file',
    path: '.npmrc',
    class: 'registry',
    extract: 'whole',
    reason: 'Project registry config: where packages are fetched from, with which token, and whether install scripts run.',
  },
  // --- Per user ------------------------------------------------------------
  {
    id: 'user.claude-settings',
    scope: 'user',
    base: 'home',
    match: 'file',
    path: '.claude/settings.json',
    class: 'agent-config',
    extract: 'whole',
    reason: "Claude Code's global hooks and permissions apply to every repo and every session.",
  },
  {
    id: 'user.claude-plugins',
    scope: 'user',
    base: 'home',
    match: 'file',
    path: '.claude/plugins/installed_plugins.json',
    class: 'agent-config',
    extract: 'whole',
    reason: 'Installed Claude Code plugins bring their own hooks, commands and MCP servers into every session.',
  },
  {
    id: 'user.claude-json',
    scope: 'user',
    base: 'home',
    match: 'file',
    path: '.claude.json',
    class: 'mcp',
    extract: 'claude-json-mcp',
    reason: "User and per-project MCP servers and allowed tools; only those parts are hashed, since Claude Code rewrites the rest constantly.",
  },
  {
    id: 'user.codex-config',
    scope: 'user',
    base: 'home',
    match: 'file',
    path: '.codex/config.toml',
    class: 'agent-config',
    extract: 'whole',
    reason: "Codex's global config: its MCP servers, sandbox mode and approval policy.",
  },
  {
    id: 'user.npmrc',
    scope: 'user',
    base: 'home',
    match: 'file',
    path: '.npmrc',
    class: 'registry',
    extract: 'whole',
    reason: 'Global registry config and auth tokens; a swapped registry serves every install on the machine.',
  },
  {
    id: 'user.gitconfig',
    scope: 'user',
    base: 'home',
    match: 'file',
    path: '.gitconfig',
    class: 'git-config',
    extract: 'whole',
    reason: 'Global git config can set core.hooksPath, aliases and credential helpers that run in every repo.',
  },
];

const HIGH_CLASSES: ReadonlySet<IntegrityClass> = new Set(['hooks', 'mcp', 'agent-config']);

/** `high` for hooks, MCP and agent config; `medium` for the rest (Phase 120 C). */
export function integritySeverity(cls: IntegrityClass): Extract<SecurityFindingSeverity, 'high' | 'medium'> {
  return HIGH_CLASSES.has(cls) ? 'high' : 'medium';
}

/** The watched entries for one scope. */
export function integrityEntriesFor(scope: 'repo' | 'user'): readonly IntegrityWatchEntry[] {
  return INTEGRITY_WATCHED.filter((entry) => entry.scope === scope);
}

/**
 * The entry a path falls under, or `undefined`. `relPath` is POSIX and relative to `base`. A `prefix`
 * entry matches only names directly in the base (`.env.local`, not `docs/.env.example`).
 */
export function matchIntegrityEntry(
  scope: 'repo' | 'user',
  base: IntegrityBase,
  relPath: string,
): IntegrityWatchEntry | undefined {
  const path = relPath.replace(/^\.\/+/, '');
  for (const entry of INTEGRITY_WATCHED) {
    if (entry.scope !== scope || entry.base !== base) continue;
    if (entry.match === 'file' && path === entry.path) return entry;
    if (entry.match === 'dir' && path.startsWith(`${entry.path}/`)) return entry;
    if (entry.match === 'prefix' && !path.includes('/') && path.startsWith(entry.path)) return entry;
  }
  return undefined;
}

/** A canonical JSON string: object keys sorted at every depth, so key order is not a change. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const CLAUDE_PROJECT_KEYS = ['mcpServers', 'enabledMcpjsonServers', 'disabledMcpjsonServers', 'allowedTools'] as const;

/**
 * The part of a file that is hashed, per its entry's `extract`. A file that does not parse as the JSON
 * its extract expects is hashed whole, so a corrupted or swapped file still reads as a change.
 */
export function extractIntegrityContent(extract: IntegrityExtract, text: string): string {
  if (extract === 'whole') return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return text;
  const record = parsed as Record<string, unknown>;
  if (extract === 'package-json-scripts') return canonicalJson({ scripts: record.scripts ?? null });
  const projects: Record<string, unknown> = {};
  if (record.projects !== null && typeof record.projects === 'object' && !Array.isArray(record.projects)) {
    for (const [dir, project] of Object.entries(record.projects as Record<string, unknown>)) {
      if (project === null || typeof project !== 'object') continue;
      const picked: Record<string, unknown> = {};
      for (const key of CLAUDE_PROJECT_KEYS) {
        const value = (project as Record<string, unknown>)[key];
        if (value !== undefined) picked[key] = value;
      }
      if (Object.keys(picked).length > 0) projects[dir] = picked;
    }
  }
  return canonicalJson({ mcpServers: record.mcpServers ?? null, projects });
}

// --- The baseline on disk ----------------------------------------------------

/** One watched file's baseline. `hash: null` = the file is absent. */
export const IntegrityBaselineFileSchema = z.object({
  hash: z.string().nullable(),
  /** Set while an out-of-commit change is open as a finding; cleared once it is committed or reverted. */
  flagged: z
    .object({
      hash: z.string().nullable(),
      at: z.number().int().nonnegative(),
      fingerprint: z.string(),
    })
    .optional(),
});
export type IntegrityBaselineFile = z.infer<typeof IntegrityBaselineFileSchema>;

/** `<userData>/security/integrity/<scopeId>.json`; keys of `files` are `<base>:<relPath>`. */
export const IntegrityBaselineSchema = z.object({
  version: z.literal(1),
  scopeId: z.string(),
  /** The directory the baseline was taken over (a repo's worktree root, or the home dir). */
  root: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  files: z.record(z.string(), IntegrityBaselineFileSchema),
});
export type IntegrityBaseline = z.infer<typeof IntegrityBaselineSchema>;

/** The `files` key for a path. */
export function integrityFileKey(base: IntegrityBase, relPath: string): string {
  return `${base}:${relPath}`;
}
