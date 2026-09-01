#!/usr/bin/env node
/**
 * Renderer bundle report — Phase 36 Theme A.
 *
 * Reads what Vite actually emitted into `packages/app/dist` and prints the three
 * numbers Theme C is judged on: entry-chunk KB, total JS KB, and the ten
 * biggest chunks. The entry chunk comes from `.vite/manifest.json` rather than
 * from globbing `assets/index-*.js` — the manifest names the entry, a glob
 * guesses at a hash pattern.
 *
 * Usage, from the repo root:
 *
 *   moon run app:build
 *   node scripts/perf/bundle-report.mjs
 *   node scripts/perf/bundle-report.mjs --assert   # fail on a budget breach
 *   node scripts/perf/bundle-report.mjs --json
 *
 * Sizes are raw bytes on disk, /1024, one decimal. Not gzip: what the app pays
 * is parse+execute of the bytes it loads off `file://`, where nothing is
 * compressed. `MSTUDIO_BUNDLE_STATS=1 moon run app:build` writes the treemap
 * (`dist/stats.html`) for the question this script cannot answer — WHICH module
 * put the weight there.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DIST = join(REPO_ROOT, 'packages', 'app', 'dist');
const MANIFEST = join(DIST, '.vite', 'manifest.json');
const BUDGETS = join(HERE, 'budgets.json');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const doAssert = args.includes('--assert');

if (!existsSync(DIST)) {
  console.error(`missing ${DIST} → moon run app:build`);
  process.exit(2);
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

/** Every emitted `.js`, recursively — chunks live under `assets/`, the entry may not. */
function jsFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    // `.vite/` holds the manifest, not shipped code; stats.html is a build artifact.
    if (name === '.vite') continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) jsFiles(full, acc);
    else if (name.endsWith('.js')) acc.push({ file: full.slice(DIST.length + 1), bytes: stat.size });
  }
  return acc;
}

/** The entry chunk's emitted filename, per the manifest. */
function entryFile() {
  if (!existsSync(MANIFEST)) {
    console.error(
      `missing ${MANIFEST} — vite needs \`build.manifest: true\` (packages/app/vite.config.ts)`,
    );
    process.exit(2);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const entry = Object.values(manifest).find((e) => e.isEntry);
  if (!entry) {
    console.error(`no isEntry chunk in ${MANIFEST}`);
    process.exit(2);
  }
  return entry.file;
}

const files = jsFiles(DIST);
const entry = entryFile();
const entryBytes = files.find((f) => f.file === entry)?.bytes ?? 0;
const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
const top = [...files].sort((a, b) => b.bytes - a.bytes).slice(0, 10);

const report = {
  entry: { file: entry, kb: kb(entryBytes) },
  totalJsKb: kb(totalBytes),
  chunks: files.length,
  top: top.map((f) => ({ file: f.file, kb: kb(f.bytes) })),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nrenderer bundle — packages/app/dist\n`);
  console.log(`  entry chunk   ${report.entry.kb} KB  (${report.entry.file})`);
  console.log(`  total JS      ${report.totalJsKb} KB across ${report.chunks} chunk(s)\n`);
  console.log('  largest chunks');
  const width = Math.max(...top.map((f) => f.file.length));
  for (const f of top) console.log(`    ${f.file.padEnd(width)}  ${kb(f.bytes).toString().padStart(8)} KB`);
  console.log('');
}

if (!doAssert) process.exit(0);

/**
 * `--assert` is the `:perf` target's teeth, and the budgets file is Theme H's
 * deliverable. Until it lands there is nothing to compare against, and saying so
 * beats inventing a threshold here that Theme H would then have to contradict.
 */
if (!existsSync(BUDGETS)) {
  console.error(
    `--assert needs ${BUDGETS}, which Phase 36 Theme H owns and has not landed yet.`,
  );
  process.exit(2);
}

const budgets = JSON.parse(readFileSync(BUDGETS, 'utf8'));
const breaches = [];
if (typeof budgets.entryKb === 'number' && report.entry.kb > budgets.entryKb) {
  breaches.push(`entry chunk ${report.entry.kb} KB > ${budgets.entryKb} KB`);
}
if (typeof budgets.totalJsKb === 'number' && report.totalJsKb > budgets.totalJsKb) {
  breaches.push(`total JS ${report.totalJsKb} KB > ${budgets.totalJsKb} KB`);
}

if (breaches.length > 0) {
  for (const breach of breaches) console.error(`budget breach: ${breach}`);
  process.exit(1);
}
console.log('budgets ok');
