import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CHAT_ENGINE_OLLAMA, type ChatSkill } from '@midnite/studio-shared';

import { parseSkillFrontmatter, readSkillHead, SKILL_NAME } from '../scaffold/repo-skills';

/**
 * Skill discovery for the Chats composer's `/` picker.
 *
 * Plain Node, no electron: the handler resolves the repo and the home dir and
 * hands them in, so all of this runs under bare vitest against temp dirs.
 *
 * Which folders are scanned depends on the chat's engine, because the picker
 * should offer exactly what that agent will load:
 *
 * - `claude` — `<repo>/.claude/skills`, `~/.claude/skills`, and every enabled
 *   plugin's `<installPath>/skills` from `~/.claude/plugins/installed_plugins.json`
 *   (names namespaced `<plugin>:<skill>`, as Claude Code invokes them).
 * - `codex` — `.codex/skills` then `.agents/skills`, repo before home.
 * - any other roster agent — the agent-neutral `.agents/skills` mirror.
 * - `ollama` — none: a bare model has no skill loader.
 */

export type SkillRoot = { dir: string; scope: ChatSkill['scope']; prefix?: string };

/** Hard cap on what one scan returns — the picker shows ten; this bounds a runaway plugin dir. */
export const MAX_CHAT_SKILLS = 1_000;

function conventionDirs(engine: string): readonly string[] {
  if (engine === CHAT_ENGINE_OLLAMA) return [];
  if (engine === 'claude') return ['.claude'];
  if (engine === 'codex') return ['.codex', '.agents'];
  return ['.agents'];
}

/** The project and user roots for `engine`, project first so a repo's own copy wins a name clash. */
export function chatSkillRoots(engine: string, repoPath: string | null, home: string): SkillRoot[] {
  const dirs = conventionDirs(engine);
  return [
    ...(repoPath ? dirs.map((d) => ({ dir: join(repoPath, d, 'skills'), scope: 'project' as const })) : []),
    ...dirs.map((d) => ({ dir: join(home, d, 'skills'), scope: 'user' as const })),
  ];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

/**
 * Claude Code's installed plugins that carry skills, as roots. A plugin set to
 * `false` in `~/.claude/settings.json`'s `enabledPlugins` is skipped; a missing
 * or unreadable manifest is simply "no plugins".
 */
export async function claudePluginSkillRoots(home: string): Promise<SkillRoot[]> {
  const manifest = await readJson(join(home, '.claude', 'plugins', 'installed_plugins.json'));
  if (!isRecord(manifest) || !isRecord(manifest['plugins'])) return [];
  const settings = await readJson(join(home, '.claude', 'settings.json'));
  const enabled = isRecord(settings) && isRecord(settings['enabledPlugins']) ? settings['enabledPlugins'] : {};

  const roots: SkillRoot[] = [];
  for (const [key, installs] of Object.entries(manifest['plugins'])) {
    if (enabled[key] === false || !Array.isArray(installs)) continue;
    const install = installs.find((i): i is { installPath: string } => isRecord(i) && typeof i['installPath'] === 'string');
    if (!install) continue;
    const plugin = key.split('@')[0] ?? key;
    if (!SKILL_NAME.test(plugin)) continue;
    roots.push({ dir: join(install.installPath, 'skills'), scope: 'plugin', prefix: `${plugin}:` });
  }
  return roots;
}

/**
 * Every `<root>/<dir>/SKILL.md` across `roots`, named by its frontmatter `name`
 * (falling back to the directory) and deduplicated first-wins, sorted by name.
 * A directory with no readable SKILL.md, or a name a CLI could not invoke as
 * `/<name>`, is skipped — one broken skill must not blank the picker.
 */
export async function scanSkillRoots(roots: readonly SkillRoot[], limit = MAX_CHAT_SKILLS): Promise<ChatSkill[]> {
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      let entries;
      try {
        entries = await readdir(root.dir, { withFileTypes: true });
      } catch {
        return [];
      }
      const dirs = entries
        .filter((e) => e.isDirectory() || e.isSymbolicLink())
        .map((e) => e.name)
        .sort();
      const found = await Promise.all(
        dirs.map(async (dir): Promise<ChatSkill | null> => {
          const head = await readSkillHead(join(root.dir, dir, 'SKILL.md'));
          if (head === null) return null;
          const front = parseSkillFrontmatter(head);
          const base = (front?.name ?? dir).trim();
          const name = `${root.prefix ?? ''}${base}`;
          if (!SKILL_NAME.test(base) || name.length > 200) return null;
          const description = (front?.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 2_000);
          return { name, description, scope: root.scope };
        }),
      );
      return found.filter((s): s is ChatSkill => s !== null);
    }),
  );

  const seen = new Map<string, ChatSkill>();
  for (const skills of perRoot) {
    for (const skill of skills) if (!seen.has(skill.name)) seen.set(skill.name, skill);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

/** The whole discovery for one chat: its engine's roots (plus Claude's plugins), scanned. */
export async function discoverChatSkills(opts: { engine: string; repoPath: string | null; home: string }): Promise<ChatSkill[]> {
  const roots = chatSkillRoots(opts.engine, opts.repoPath, opts.home);
  if (opts.engine === 'claude') roots.push(...(await claudePluginSkillRoots(opts.home)));
  return scanSkillRoots(roots);
}
