#!/usr/bin/env node
// Skill mirror parity (Phase 151 Theme A). The repo carries each `midnite-*` skill in two mirrors,
// `.agents/skills/` (runtime-neutral, the source; Codex, Antigravity and most other CLIs read it)
// and `.claude/skills/`. The Claude copy adds `argument-hint` / `allowed-tools` frontmatter and
// names `AskUserQuestion`; the neutral one says "Invoke with:" and ask in plain words. Those differences are intentional.
//
//   node scripts/skills/sync-skills.mjs                  audit: print per-skill status, exit 1 on drift
//   node scripts/skills/sync-skills.mjs --json           machine-readable audit
//   node scripts/skills/sync-skills.mjs --lint [--json]  check every skill's script references and flags, and byte drift of the
//                                                        non-SKILL files between mirrors; exit 1 on any problem
//   node scripts/skills/sync-skills.mjs --write          propagate bodies from the source mirror
//   node scripts/skills/sync-skills.mjs --write --from claude --skill midnite-sitrep
//
// `--no-llm` is accepted everywhere as a documented no-op: this script has no LLM use.
// Statuses: `identical` (byte-equal), `mirror-variant` (equal once the intentional differences are
// normalised away), `drift` (real content differs), `missing` (absent from a mirror).
// `--write` replaces each target SKILL.md BODY with the source body and keeps the target's own
// frontmatter, so Claude-only keys survive; a missing skill dir is created from the source.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
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

// ---- --lint ---------------------------------------------------------------------------------------
// Every skill that names a script must name one that exists, with flags that script accepts. The flag
// check is a static scan of the script's source for the literal `--flag` (a `case` arm, an `argv.includes`
// or a documented no-op comment all count), plus the sibling `.mjs` of a `.sh` wrapper. It is static on
// purpose: running `--help` on thirty scripts would execute them, and several have no help at all.

// Only `scripts/skills/` is ours to check: a bare `scripts/render.mjs` or `scripts/tracker-check.mjs` in a
// template belongs to the repo the skill is installed into.
// `--no-llm` is the one flag a skill attaches to a whole step rather than to one command.
const GLOBAL_FLAGS = ['--no-llm'];
const SKILL_ROOTS = ['.agents/skills', '.claude/skills', 'templates/midnite/.agents/skills', 'templates/midnite/.claude/skills', 'templates/media-video/.agents/skills', 'templates/media-video/.claude/skills', 'templates/media-game/skills'];
const SCRIPT_RE = /[\w$.{}<>*/-]*(?:scripts\/skills\/[\w$.{}<>*/-]+|\$\{?\w+\}?[\w$.{}<>*/-]*)\.(?:mjs|sh|js)\b/g;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) walk(f, out);
    else out.push(f);
  }
  return out;
}

/** `--flag` tokens a script's source mentions (and its `.mjs` sibling when it is a `.sh` wrapper). */
export function acceptedFlags(file) {
  let text = readFileSync(file, 'utf8');
  if (file.endsWith('.sh')) {
    const sib = file.replace(/\.sh$/, '.mjs');
    if (existsSync(sib)) text += readFileSync(sib, 'utf8');
  }
  return new Set(text.match(/--[a-z][a-z0-9-]*/g) ?? []);
}

/** Script references in one SKILL.md: `[{line, script, flags}]`. Flags come from the same inline code span
 * or fenced line as the script, plus bare-flag spans (`Add `--no-llm``) on a line that names scripts. */
export function extractRefs(text) {
  const refs = [];
  text.split('\n').forEach((raw, i) => {
    const spans = raw.match(/`[^`]+`/g)?.map((s) => s.slice(1, -1)) ?? [];
    const units = spans.length ? spans : [raw];
    const bare = spans.filter((s) => GLOBAL_FLAGS.includes(s));
    for (const u of units) {
      for (const m of u.matchAll(SCRIPT_RE)) {
        const rest = u.slice(m.index + m[0].length).split(/&&|\||;/)[0];
        refs.push({ line: i + 1, script: m[0], flags: [...new Set([...(rest.match(/(?<![\w-])--[a-z][a-z0-9-]*/g) ?? []), ...bare])] });
      }
    }
  });
  return refs;
}

/** Lint every skill tree under `root`. Returns `[{file, line?, kind, detail}]`. */
export function lint(root) {
  const problems = [];
  const cache = new Map();
  const flagsOf = (f) => cache.get(f) ?? cache.set(f, acceptedFlags(f)).get(f);
  for (const sr of SKILL_ROOTS) {
    for (const f of walk(join(root, sr)).filter((x) => basename(x) === 'SKILL.md')) {
      const rel = relative(root, f);
      for (const r of extractRefs(readFileSync(f, 'utf8'))) {
        if (/[<>*]/.test(r.script)) continue; // a placeholder, not a path
        if (r.script.includes('$')) {
          problems.push({ file: rel, line: r.line, kind: 'undefined-variable', detail: `${r.script} uses a variable no step defines` });
          continue;
        }
        const target = join(root, r.script);
        if (!existsSync(target)) {
          problems.push({ file: rel, line: r.line, kind: 'missing-script', detail: r.script });
          continue;
        }
        for (const flag of r.flags) {
          if (!flagsOf(target).has(flag)) problems.push({ file: rel, line: r.line, kind: 'unknown-flag', detail: `${r.script} does not accept ${flag}` });
        }
      }
    }
  }
  // Non-SKILL files (helper scripts, references, templates) must be byte-identical across each pair of mirrors.
  const rels = (dir) => walk(join(root, dir)).map((x) => relative(join(root, dir), x)).filter((x) => basename(x) !== 'SKILL.md');
  const pairs = [['.agents/skills', '.claude/skills'], ['templates/midnite/.agents/skills', 'templates/midnite/.claude/skills'], ['templates/media-video/.agents/skills', 'templates/media-video/.claude/skills']];
  for (const [a, b] of pairs) {
    for (const r of [...new Set([...rels(a), ...rels(b)])].sort()) {
      const fa = join(root, a, r);
      const fb = join(root, b, r);
      if (!existsSync(fa) || !existsSync(fb)) problems.push({ file: existsSync(fa) ? join(a, r) : join(b, r), kind: 'mirror-missing', detail: `absent from ${existsSync(fa) ? b : a}` });
      else if (!readFileSync(fa).equals(readFileSync(fb))) problems.push({ file: join(a, r), kind: 'mirror-drift', detail: `differs from ${join(b, r)}` });
    }
  }
  return problems;
}

function main(argv) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const from = arg('--from');
  const opts = { source: from ? `.${from.replace(/^\./, '')}` : '.agents', only: arg('--skill') };
  if (argv.includes('--lint')) {
    const problems = lint(root);
    if (argv.includes('--json')) console.log(JSON.stringify({ problems }, null, 2));
    else console.log(problems.length ? `${problems.map((p) => `${p.file}${p.line ? `:${p.line}` : ''}  ${p.kind}  ${p.detail}`).join('\n')}\n\n${problems.length} problem(s)` : 'skill lint clean');
    return problems.length ? 1 : 0;
  }
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
