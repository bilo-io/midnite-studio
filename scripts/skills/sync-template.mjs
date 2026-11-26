#!/usr/bin/env node
// sync-template: keeps the onboarding kit (templates/midnite/) generated from this repo's own skills, so a
// skill change that forgets the kit fails the lint instead of shipping a stale kit to every onboarded repo.
//
// The kit is DERIVED, never hand-edited:
//   - each kit skill (both mirrors, every file in its folder) = this repo's copy with the declared, reviewed
//     generic substitutions in templates/midnite-overrides/<skill>.md (and _all.md) applied;
//   - docs/TRACKER.md likewise, from templates/midnite-overrides/doc-TRACKER.md;
//   - scripts/skills/** = byte-identical copies of every script the kit's files call, plus everything those
//     import (tests excluded). The scripts themselves name no repo: see lib/skills-config.mjs.
// --check also fails on an override that no longer matches (the repo text moved under it), on a kit file
// nothing generates, on a repo-specific token left in a generic skill, and on a reference to a skill the
// kit does not ship.
//
//   node scripts/skills/sync-template.mjs [--check | --write] [--json]
// Exit: 0 in sync (or written) · 1 drift · 2 usage / a broken override or script closure.
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT = 'templates/midnite';
export const OVERRIDES = 'templates/midnite-overrides';
export const MIRRORS = ['.claude/skills', '.agents/skills'];
export const SCRIPTS = 'scripts/skills';

/** The workflow skills the kit ships (the media set rides along: it is about the app, not this repo). */
export const KIT_SKILLS = [
  'midnite-address-issue', 'midnite-agents', 'midnite-agents-handover', 'midnite-build', 'midnite-build-adhoc',
  'midnite-design', 'midnite-fleet', 'midnite-git-cleanup', 'midnite-git-report',
  'midnite-maintain', 'midnite-orchestrate', 'midnite-plan', 'midnite-refine', 'midnite-retro', 'midnite-swarm',
  'midnite-test', 'midnite-triage', 'midnite-verify',
];
export const MEDIA_PREFIX = 'midnite-media-';
/** Docs the kit ships, each derived through `doc-<basename>` overrides. */
export const KIT_DOCS = ['docs/TRACKER.md'];

/** Strings that name this repo, its account, its toolchain or its board; none may survive into a generic file. */
export const FORBIDDEN = [
  'bilo-io', 'bilo-ekko', 'Midnite Studio', 'midnite-studio', 'midnite-apps', 'moon run', 'GITHUB_PACKAGES_TOKEN',
  'INITIAL_PLAN', 'pnpm', 'board 8',
];

const MARK = { open: '<<<<', mid: '====', close: '>>>>' };

/**
 * Parse an overrides file: prose (the reason) around blocks of
 *   <<<<
 *   exact text in the repo's file
 *   ====
 *   its generic replacement (may be empty)
 *   >>>>
 * Returns `{ ok, blocks:[{from, to, line}] }` or `{ ok:false, message }`.
 */
export function parseOverrides(text, name = 'overrides') {
  const lines = text.split('\n');
  const blocks = [];
  let state = 'prose';
  let from = [];
  let to = [];
  let start = 0;
  for (const [i, line] of lines.entries()) {
    if (state === 'prose') {
      if (line === MARK.open) [state, from, to, start] = ['from', [], [], i + 1];
      else if (line === MARK.mid || line === MARK.close) return { ok: false, message: `${name}:${i + 1}: "${line}" outside a block` };
    } else if (state === 'from') {
      if (line === MARK.mid) state = 'to';
      else if (line === MARK.open || line === MARK.close) return { ok: false, message: `${name}:${i + 1}: expected ${MARK.mid}` };
      else from.push(line);
    } else if (line === MARK.close) {
      if (!from.length) return { ok: false, message: `${name}:${start}: empty match text` };
      blocks.push({ from: from.join('\n'), to: to.join('\n'), line: start });
      state = 'prose';
    } else if (line === MARK.open || line === MARK.mid) {
      return { ok: false, message: `${name}:${i + 1}: expected ${MARK.close}` };
    } else to.push(line);
  }
  if (state !== 'prose') return { ok: false, message: `${name}:${start}: unterminated block` };
  return { ok: true, blocks };
}

/**
 * Apply every block to every file (`{path: text}`), replacing all occurrences. A block that matches in no
 * file is stale — the repo text moved under it — and is reported, never silently dropped.
 */
export function applyOverrides(files, blocks, name = 'overrides') {
  const out = { ...files };
  const stale = [];
  const hits = new Set();
  for (const b of blocks) {
    let hit = false;
    for (const p of Object.keys(out)) {
      if (out[p].includes(b.from)) {
        out[p] = out[p].split(b.from).join(b.to);
        hit = true;
      }
    }
    if (hit) hits.add(b);
    else stale.push(`${name}:${b.line}: matches nothing: "${b.from.split('\n')[0].slice(0, 70)}"`);
  }
  return { files: out, stale, hits };
}

function walk(root, dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const rel = posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(root, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

const readOverrides = (root, name) => {
  const p = join(root, OVERRIDES, `${name}.md`);
  return existsSync(p) ? parseOverrides(readFileSync(p, 'utf8'), `${OVERRIDES}/${name}.md`) : { ok: true, blocks: [] };
};

/** `scripts/skills/x` paths a text calls, as repo-relative paths. */
export function scriptRefs(text) {
  return [...new Set([...text.matchAll(/scripts\/skills\/[A-Za-z0-9_./-]*[A-Za-z0-9_]/g)].map((m) => m[0]))];
}

/** Relative dependencies of one script: ES imports and `$here/…` in shell. */
export function scriptDeps(path, text) {
  const deps = [];
  if (path.endsWith('.mjs') || path.endsWith('.js')) {
    for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](\.{1,2}\/[^'"]+)['"]/gm)) deps.push(posix.normalize(posix.join(posix.dirname(path), m[1])));
  }
  if (path.endsWith('.sh')) {
    for (const m of text.matchAll(/\$\{?here\}?\/([A-Za-z0-9_./-]+)/g)) deps.push(posix.normalize(posix.join(posix.dirname(path), m[1])));
  }
  return deps;
}

/** Every script the kit needs: the referenced ones plus their transitive relative imports, never a test. */
export function scriptClosure(root, roots) {
  const seen = new Set();
  const errors = [];
  const queue = [...roots];
  while (queue.length) {
    const p = queue.shift();
    if (seen.has(p)) continue;
    if (!p.startsWith(`${SCRIPTS}/`)) {
      errors.push(`script closure leaves ${SCRIPTS}/: ${p} (a kit script may not import repo-only code)`);
      continue;
    }
    const abs = join(root, p);
    if (!existsSync(abs) || !statSync(abs).isFile()) {
      errors.push(`referenced script does not exist: ${p}`);
      continue;
    }
    if (/\.test\.m?js$/.test(p)) continue;
    seen.add(p);
    queue.push(...scriptDeps(p, readFileSync(abs, 'utf8')));
  }
  return { scripts: [...seen].sort(), errors };
}

const isMedia = (p) => p.includes(`/${MEDIA_PREFIX}`);

/**
 * Build the kit in memory. Returns `{ files: Map<kitRelPath, {data, mode}>, errors, stale, lint }`:
 * `errors` are broken overrides or a broken closure (exit 2), `stale` overrides that match nothing and
 * `lint` repo-specific leftovers (both drift, exit 1).
 */
export function buildKit(root) {
  const files = new Map();
  const errors = [];
  const stale = [];
  const lint = [];
  const all = readOverrides(root, '_all');
  if (!all.ok) errors.push(all.message);

  const repoSkills = new Set(readdirSync(join(root, MIRRORS[0]), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
  const media = [...repoSkills].filter((s) => s.startsWith(MEDIA_PREFIX));
  const shipped = new Set([...KIT_SKILLS, ...media]);
  for (const s of KIT_SKILLS) if (!repoSkills.has(s)) errors.push(`kit skill ${s} is not in ${MIRRORS[0]}`);

  const allHits = new Set();
  for (const skill of [...KIT_SKILLS, ...media].filter((s) => repoSkills.has(s))) {
    const src = {};
    for (const m of MIRRORS) for (const p of walk(root, `${m}/${skill}`)) src[p] = readFileSync(join(root, p), 'utf8');
    const own = readOverrides(root, skill);
    if (!own.ok) errors.push(own.message);
    // Media skills are byte-identical by policy (scripts/skill-copies.test.mjs): no overrides apply.
    if (skill.startsWith(MEDIA_PREFIX) && own.blocks?.length) errors.push(`${OVERRIDES}/${skill}.md: media skills ship byte-identical; no overrides`);
    const r = applyOverrides(src, skill.startsWith(MEDIA_PREFIX) ? [] : own.blocks ?? [], `${OVERRIDES}/${skill}.md`);
    stale.push(...r.stale);
    const g = applyOverrides(r.files, skill.startsWith(MEDIA_PREFIX) ? [] : all.blocks ?? [], `${OVERRIDES}/_all.md`);
    for (const b of g.hits) allHits.add(b);
    r.files = g.files;
    for (const [p, text] of Object.entries(r.files)) {
      const mode = statSync(join(root, p)).mode & 0o111 ? 0o755 : 0o644;
      files.set(p, { data: text, mode });
    }
  }
  for (const doc of KIT_DOCS) {
    const name = `doc-${posix.basename(doc)}`;
    const o = readOverrides(root, name);
    if (!o.ok) errors.push(o.message);
    const r = applyOverrides({ [doc]: readFileSync(join(root, doc), 'utf8') }, o.blocks ?? [], `${OVERRIDES}/${name}.md`);
    stale.push(...r.stale);
    const g = applyOverrides(r.files, all.blocks ?? [], `${OVERRIDES}/_all.md`);
    for (const b of g.hits) allHits.add(b);
    files.set(doc, { data: g.files[doc], mode: 0o644 });
  }
  // _all.md blocks are global: stale only when they match no file at all.
  for (const b of all.blocks ?? []) if (!allHits.has(b)) stale.push(`${OVERRIDES}/_all.md:${b.line}: matches nothing: "${b.from.split('\n')[0].slice(0, 70)}"`);

  // Lint the generic files: no repo-specific token, no reference to a skill the kit does not ship.
  for (const [p, f] of files) {
    if (isMedia(p)) continue;
    for (const tok of FORBIDDEN) if (f.data.includes(tok)) lint.push(`${KIT}/${p}: still names "${tok}" (add an override)`);
    for (const m of f.data.matchAll(/\bmidnite-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
      if (repoSkills.has(m[0]) && !shipped.has(m[0])) lint.push(`${KIT}/${p}: refers to /${m[0]}, which the kit does not ship (add an override)`);
    }
  }

  const roots = new Set();
  for (const f of files.values()) for (const r of scriptRefs(f.data)) roots.add(r);
  const closure = scriptClosure(root, [...roots]);
  errors.push(...closure.errors);
  for (const p of closure.scripts) {
    const st = statSync(join(root, p));
    const data = readFileSync(join(root, p), 'utf8');
    for (const tok of ['bilo-io', 'midnite-studio', 'midnite-apps']) if (data.includes(tok)) lint.push(`${p}: names "${tok}"; kit scripts ship verbatim, so read it from .midnite/skills.json`);
    files.set(p, { data, mode: st.mode & 0o111 ? 0o755 : 0o644 });
  }
  return { files, errors, stale, lint };
}

/** Kit files the generator owns (anything else under these roots is stale and removed by --write). */
export function managedKitFiles(root) {
  const kit = join(root, KIT);
  return [...MIRRORS, SCRIPTS].flatMap((d) => walk(kit, d)).concat(KIT_DOCS.filter((d) => existsSync(join(kit, d))));
}

/** Compare the built kit to disk. Returns `{ missing, changed, extra, modeOff }` as kit-relative paths. */
export function diffKit(root, built) {
  const kit = join(root, KIT);
  const missing = [];
  const changed = [];
  const modeOff = [];
  for (const [p, f] of built.files) {
    const abs = join(kit, p);
    if (!existsSync(abs)) missing.push(p);
    else {
      if (readFileSync(abs, 'utf8') !== f.data) changed.push(p);
      if (((statSync(abs).mode & 0o111) !== 0) !== (f.mode === 0o755)) modeOff.push(p);
    }
  }
  const extra = managedKitFiles(root).filter((p) => !built.files.has(p));
  return { missing, changed, extra, modeOff };
}

export function writeKit(root, built) {
  const kit = join(root, KIT);
  const d = diffKit(root, built);
  for (const p of d.extra) rmSync(join(kit, p));
  for (const [p, f] of built.files) {
    const abs = join(kit, p);
    mkdirSync(dirname(abs), { recursive: true });
    if (!existsSync(abs) || readFileSync(abs, 'utf8') !== f.data) writeFileSync(abs, f.data);
    chmodSync(abs, f.mode);
  }
  return d;
}

/** Run the check (or write) and return `{ code, lines }`. */
export function run(root, { write = false } = {}) {
  const built = buildKit(root);
  const lines = [];
  if (built.errors.length) return { code: 2, lines: built.errors.map((e) => `error: ${e}`) };
  if (write) {
    const d = writeKit(root, built);
    lines.push(`wrote ${KIT}: ${d.missing.length} new, ${d.changed.length} changed, ${d.extra.length} removed, ${d.modeOff.length} mode fixed`);
  } else {
    const d = diffKit(root, built);
    for (const p of d.missing) lines.push(`missing: ${KIT}/${p}`);
    for (const p of d.changed) lines.push(`drifted: ${KIT}/${p}`);
    for (const p of d.extra) lines.push(`stale file: ${KIT}/${p} (nothing generates it)`);
    for (const p of d.modeOff) lines.push(`mode: ${KIT}/${p} (executable bit differs from the source)`);
  }
  lines.push(...built.stale.map((s) => `stale override: ${s}`), ...built.lint.map((s) => `lint: ${s}`));
  const drift = lines.filter((l) => !l.startsWith('wrote ')).length > 0;
  if (drift && !write) lines.push(`the kit has drifted from the repo's skills: run \`node ${SCRIPTS}/sync-template.mjs --write\`, review the diff, and add an override in ${OVERRIDES}/ for anything repo-specific`);
  return { code: drift ? 1 : 0, lines: lines.length ? lines : [`${KIT} is in sync (${built.files.size} files)`] };
}

export function main(argv = process.argv.slice(2), { root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), out = (s) => process.stdout.write(`${s}\n`) } = {}) {
  const bad = argv.filter((a) => !['--check', '--write', '--json'].includes(a));
  if (bad.length || (argv.includes('--check') && argv.includes('--write'))) {
    out('usage: sync-template.mjs [--check | --write] [--json]');
    return 2;
  }
  const r = run(root, { write: argv.includes('--write') });
  out(argv.includes('--json') ? JSON.stringify(r, null, 2) : r.lines.join('\n'));
  return r.code;
}

if (process.argv[1] && relative(process.argv[1], fileURLToPath(import.meta.url)).split(sep).join('/') === '') process.exit(main());
