import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { failure, ok, type GitOpResult, type RepoSkill, type RepoSkillList } from '@midnite/studio-shared';

type SkillSource = RepoSkill['source'];

/** A skill name is one path segment a CLI can invoke as `/<name>` — no
 *  whitespace, no slashes, nothing a stray frontmatter line could smuggle in. */
const SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/** Cap on how much of a SKILL.md is read — the frontmatter is at the top, and
 *  a runaway file should not cost a full read per picker open. */
const MAX_HEAD_BYTES = 16 * 1024;

/**
 * Which convention directory is read first for `agentId` — the one the agent
 * about to launch actually loads. A name present in several directories is
 * taken from the first; they are mirrors in practice, but the launching
 * agent's own copy is the one whose description is true for it.
 */
export function skillSourceOrder(agentId: string | undefined): readonly SkillSource[] {
  if (agentId === 'codex') return ['.codex', '.agents', '.claude'];
  if (agentId === undefined || agentId === 'claude') return ['.claude', '.agents', '.codex'];
  return ['.agents', '.claude', '.codex'];
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if (first === '"' && last === '"') {
      return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    if (first === "'" && last === "'") return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

/**
 * The `name` and `description` out of a SKILL.md's leading `---` frontmatter
 * block. A deliberately small reader, not a YAML parser: top-level
 * `key: value` scalars (plain, single- or double-quoted) plus `>`/`|` block
 * scalars, which is every shape a skill's frontmatter takes in practice.
 * Anything else — no frontmatter, an unterminated block — yields `null`.
 */
export function parseSkillFrontmatter(text: string): { name?: string; description?: string } | null {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end === -1) return null;

  const fields: Record<string, string> = {};
  for (let index = 1; index < end; index += 1) {
    const line = lines[index]!;
    const match = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    const rest = match[2]!.trim();
    if (rest === '>' || rest === '|' || /^[>|][+-]?$/.test(rest)) {
      const block: string[] = [];
      while (index + 1 < end && (/^\s/.test(lines[index + 1]!) || lines[index + 1]!.trim() === '')) {
        index += 1;
        block.push(lines[index]!.trim());
      }
      fields[key] = rest.startsWith('|') ? block.join('\n').trim() : block.filter(Boolean).join(' ');
    } else {
      fields[key] = unquote(rest);
    }
  }
  return {
    ...(fields['name'] !== undefined ? { name: fields['name'] } : {}),
    ...(fields['description'] !== undefined ? { description: fields['description'] } : {}),
  };
}

async function readHead(path: string): Promise<string | null> {
  try {
    const buffer = await readFile(path);
    return buffer.subarray(0, MAX_HEAD_BYTES).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Every skill under `<workdir>/<.claude|.agents|.codex>/skills/<dir>/SKILL.md`,
 * deduplicated by name in `skillSourceOrder(agentId)` order and sorted by
 * name. The frontmatter's `name` wins over the directory's (that is what the
 * CLI invokes); a directory with no readable SKILL.md is skipped, not an
 * error — a half-written skill should not blank the whole picker.
 */
export async function listRepoSkills(
  workdir: string,
  agentId?: string,
): Promise<GitOpResult<RepoSkillList>> {
  try {
    const seen = new Map<string, RepoSkill>();
    for (const source of skillSourceOrder(agentId)) {
      const root = join(workdir, source, 'skills');
      let entries;
      try {
        entries = await readdir(root, { withFileTypes: true });
      } catch {
        continue;
      }
      const dirs = entries
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name)
        .sort();
      for (const dir of dirs) {
        const head = await readHead(join(root, dir, 'SKILL.md'));
        if (head === null) continue;
        const front = parseSkillFrontmatter(head);
        const name = (front?.name ?? dir).trim();
        if (!SKILL_NAME.test(name) || seen.has(name)) continue;
        seen.set(name, { name, description: (front?.description ?? '').trim(), source });
      }
    }
    const skills = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    return ok({ skills });
  } catch (err) {
    return failure(err instanceof Error ? err.message : String(err));
  }
}
