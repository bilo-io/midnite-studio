#!/usr/bin/env node
// Focused checks for a diff (Phase 151 Theme H). Maps changed files to the workspace package that
// owns them (nearest package.json) and prints the commands that check just that: vitest on the
// changed or related test files, `tsc --noEmit` for the package (building `shared` first when the
// package depends on it) and eslint on the changed files. `--run` executes them one after another and
// prints a pass/fail table. It never builds or tests the whole workspace: that gate exhausts RAM.
//
//   node scripts/skills/scoped-check.mjs [--base origin/main] [--run] [--json] [--no-llm]
// Exit: 0 all passed (or printed only), 1 a check failed, 2 usage.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { arg } from './lib/pr-common.mjs';

const TEST_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const LINTABLE = /\.[cm]?[jt]sx?$/;
const SHARED = '@midnite/studio-shared';

/** Nearest owning package dir for `file` (relative to the repo root); `exists(dir/package.json)` is injectable. */
export function packageOf(file, exists) {
  let d = dirname(file);
  while (d && d !== '.') {
    if (exists(join(d, 'package.json'))) return d;
    d = dirname(d);
  }
  return exists('package.json') ? '.' : null;
}

/**
 * Plan the checks. `files` are changed paths, `readPkg(dir)` returns the parsed package.json.
 * Returns `[{pkg, name, files, steps:[{id, cmd:[...], cwd}]}]` plus files owned by no package.
 */
export function plan(files, { exists, readPkg }) {
  const byPkg = new Map();
  const orphans = [];
  for (const f of files) {
    const dir = packageOf(f, exists);
    if (dir === null) orphans.push(f);
    else byPkg.set(dir, [...(byPkg.get(dir) ?? []), f]);
  }
  const out = [];
  for (const [dir, fs] of [...byPkg].sort(([a], [b]) => a.localeCompare(b))) {
    const pkg = readPkg(dir) ?? {};
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const rel = (f) => (dir === '.' ? f : relative(dir, f));
    const code = fs.filter((f) => LINTABLE.test(f));
    const tests = code.filter((f) => TEST_RE.test(f));
    const steps = [];
    if (pkg.name !== SHARED && SHARED in deps) steps.push({ id: 'build shared', cmd: ['pnpm', '--filter', SHARED, 'run', 'build'], cwd: '.' });
    if (code.length && (pkg.scripts?.test || existsVitest(dir, exists))) {
      steps.push({ id: 'vitest', cmd: ['pnpm', 'exec', 'vitest', 'run', ...(tests.length ? tests.map(rel) : ['--changed', 'origin/main']), '--passWithNoTests'], cwd: dir });
    }
    if (code.length && (pkg.scripts?.typecheck || exists(join(dir, 'tsconfig.json')))) {
      steps.push({ id: 'tsc', cmd: ['pnpm', 'exec', 'tsc', '--noEmit', ...(exists(join(dir, 'tsconfig.json')) ? ['-p', 'tsconfig.json'] : [])], cwd: dir });
    }
    if (code.length) steps.push({ id: 'eslint', cmd: ['pnpm', 'exec', 'eslint', ...code.map((f) => (dir === '.' ? f : join('.', f)))], cwd: '.' });
    out.push({ pkg: dir, name: pkg.name ?? dir, files: fs, steps });
  }
  return { packages: out, orphans };
}

const existsVitest = (dir, exists) => ['vitest.config.ts', 'vitest.config.mts', 'vitest.config.js', 'vitest.config.mjs'].some((c) => exists(join(dir, c)));

/** Flatten plan steps, dropping duplicates (one shared build per run). */
export function flatten(p) {
  const seen = new Set();
  return p.packages.flatMap((pk) =>
    pk.steps
      .filter((s) => {
        const k = `${s.cwd}\0${s.cmd.join(' ')}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((s) => ({ pkg: pk.pkg, ...s })),
  );
}

export function renderTable(rows) {
  return ['| Package | Check | Result | Time |', '|---|---|---|---|', ...rows.map((r) => `| ${r.pkg} | ${r.id} | ${r.code === 0 ? 'pass' : `FAIL (${r.code})`} | ${r.seconds}s |`)].join('\n');
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('usage: scoped-check.mjs [--base origin/main] [--run] [--json] [--no-llm]\n');
    return 0;
  }
  const base = arg(argv, '--base') ?? 'origin/main';
  const root = deps.root ?? execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const git = deps.git ?? ((a) => execFileSync('git', a, { encoding: 'utf8', cwd: root }));
  let names;
  try {
    names = [...new Set([...git(['diff', '--name-only', '-z', '--diff-filter=d', `${base}...HEAD`]).split('\0'), ...git(['diff', '--name-only', '-z', '--diff-filter=d', 'HEAD']).split('\0')])].filter(Boolean);
  } catch (e) {
    process.stderr.write(`git diff failed: ${String(e.message).split('\n')[0]}\n`);
    return 2;
  }
  const exists = deps.exists ?? ((p) => existsSync(join(root, p)));
  const readPkg = deps.readPkg ?? ((d) => JSON.parse(readFileSync(join(root, d, 'package.json'), 'utf8')));
  const p = plan(names, { exists, readPkg });
  const steps = flatten(p);
  const json = argv.includes('--json');
  const out = deps.out ?? ((s) => process.stdout.write(s));
  if (!argv.includes('--run')) {
    out(json ? `${JSON.stringify({ ...p, steps }, null, 2)}\n` : `${steps.map((s) => `(cd ${s.cwd} && ${s.cmd.join(' ')})  # ${s.pkg} ${s.id}`).join('\n') || '(no checkable files changed)'}\n`);
    return 0;
  }
  const spawn = deps.spawn ?? ((s) => spawnSync(s.cmd[0], s.cmd.slice(1), { cwd: join(root, s.cwd), stdio: 'inherit' }).status ?? 1);
  const rows = [];
  for (const s of steps) {
    const t = Date.now();
    const code = await spawn(s);
    rows.push({ pkg: s.pkg, id: s.id, code, seconds: Math.round((Date.now() - t) / 1000) });
    if (code !== 0 && s.id === 'build shared') break; // downstream checks would only fail on the stale build
  }
  out(json ? `${JSON.stringify({ rows })}\n` : `${renderTable(rows)}\n`);
  return rows.some((r) => r.code !== 0) ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c));
