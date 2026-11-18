#!/usr/bin/env node
// Skill mirror parity (Phase 151 Theme A). The repo carries each `midnite-*` skill in two mirrors,
// `.agents/skills/` (runtime-neutral, the source; Codex, Antigravity and most other CLIs read it)
// and `.claude/skills/`. The Claude copy adds `argument-hint` / `allowed-tools` frontmatter and
// names `AskUserQuestion`; the neutral one says "Invoke with:" and ask in plain words. Those differences are intentional.
//
//   node scripts/skills/sync-skills.mjs                  audit: print per-skill status, exit 1 on drift
//   node scripts/skills/sync-skills.mjs --json           machine-readable audit
//   node scripts/skills/sync-skills.mjs --write          propagate bodies from the source mirror
//   node scripts/skills/sync-skills.mjs --write --from claude --skill midnite-sitrep
//
// Statuses: `identical` (byte-equal), `mirror-variant` (equal once the intentional differences are
// normalised away), `drift` (real content differs), `missing` (absent from a mirror).
// `--write` replaces each target SKILL.md BODY with the source body and keeps the target's own
// frontmatter, so Claude-only keys survive; a missing skill dir is created from the source.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIRRORS = ['.agents', '.claude'];
export const CLAUDE_ONLY_KEYS = ['argument-hint', 'allowed-tools'];

/** Split a SKILL.md into `{front, body}`; `front` includes the `---` fences and trailing newline. */
export function splitSkill(text) {
  const m = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/.exec(text);
  return m ? { front: m[1], body: m[2] } : { front: '', body: text };
}

/** Normalise away the intentional per-runtime differences so mirrors can be compared. */
export function normalise(text) {
  const { front, body } = splitSkill(text);
  const keep = front
    .split('\n')
    .filter((l) => !CLAUDE_ONLY_KEYS.some((k) => l.startsWith(`${k}:`)))
    .join('\n');
  const b = body
    .split('\n')
    .filter((l) => !/^\*\*Invoke with:\*\*/.test(l))
    .join('\n')
    .replace(/\s*(?:via |using |with )?`?AskUserQuestion`?(?: tool)?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${keep.replace(/\s+/g, ' ').trim()}\n${b}`;
}

export function compare(a, b) {
  if (a === b) return 'identical';
  return normalise(a) === normalise(b) ? 'mirror-variant' : 'drift';
}

const listSkills = (root, mirror) => {
  const dir = join(root, mirror, 'skills');
  return existsSync(dir) ? readdirSync(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md'))) : [];
};

/** Audit every skill across mirrors against `source`. Returns `[{skill, mirrors:{<m>:status}}]`. */
export function audit(root, { source = '.agents', only } = {}) {
  const names = [...new Set(MIRRORS.flatMap((m) => listSkills(root, m)))].filter((n) => !only || n === only).sort();
  return names.map((skill) => {
    const src = join(root, source, 'skills', skill, 'SKILL.md');
    const srcText = existsSync(src) ? readFileSync(src, 'utf8') : null;
    const mirrors = {};
    for (const m of MIRRORS) {
      if (m === source) continue;
      const f = join(root, m, 'skills', skill, 'SKILL.md');
      if (srcText === null || !existsSync(f)) mirrors[m] = 'missing';
      else mirrors[m] = compare(srcText, readFileSync(f, 'utf8'));
    }
    return { skill, mirrors };
  });
}

/** Propagate `source` bodies into the other mirrors (see header). Returns the list of written paths. */
export function write(root, { source = '.agents', only } = {}) {
  const written = [];
  for (const { skill } of audit(root, { source, only })) {
    const srcDir = join(root, source, 'skills', skill);
    if (!existsSync(join(srcDir, 'SKILL.md'))) continue;
    const srcSkill = splitSkill(readFileSync(join(srcDir, 'SKILL.md'), 'utf8'));
    for (const m of MIRRORS) {
      if (m === source) continue;
      const dir = join(root, m, 'skills', skill);
      const file = join(dir, 'SKILL.md');
      if (!existsSync(file)) {
        mkdirSync(dir, { recursive: true });
        cpSync(srcDir, dir, { recursive: true });
        written.push(file);
        continue;
      }
      const cur = readFileSync(file, 'utf8');
      const next = splitSkill(cur).front + srcSkill.body;
      if (next !== cur) {
        writeFileSync(file, next);
        written.push(file);
      }
      for (const entry of readdirSync(srcDir)) {
        if (entry !== 'SKILL.md' && !existsSync(join(dir, entry))) cpSync(join(srcDir, entry), join(dir, entry), { recursive: true });
      }
    }
  }
  return written;
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const from = arg('--from');
  const opts = { source: from ? `.${from.replace(/^\./, '')}` : '.agents', only: arg('--skill') };
  if (argv.includes('--write')) {
    const files = write(root, opts);
    console.log(files.length ? files.map((f) => `wrote ${f}`).join('\n') : 'nothing to write');
    return 0;
  }
  const rows = audit(root, opts);
  const bad = rows.filter((r) => Object.values(r.mirrors).some((s) => s === 'drift' || s === 'missing'));
  if (argv.includes('--json')) console.log(JSON.stringify({ source: opts.source, rows, drift: bad.map((r) => r.skill) }, null, 2));
  else {
    for (const r of rows) console.log(`${r.skill.padEnd(36)} ${Object.entries(r.mirrors).map(([m, s]) => `${m}:${s}`).join('  ')}`);
    console.log(`\n${rows.length} skills, ${bad.length} with drift or missing copies`);
  }
  return bad.length ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exit(main(process.argv.slice(2)));
