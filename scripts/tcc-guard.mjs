#!/usr/bin/env node
// tcc-guard: keeps boot and background code out of macOS's protected folders (ISSUES Phase 2 Theme D).
//
// Entering ~/Documents, ~/Desktop, ~/Downloads, ~/Pictures, ~/Music or ~/Movies from a process with no grant
// raises a system prompt, and the packaged app was raising them nobody asked for. A source line that builds
// one of those paths, or asks Electron for one (`app.getPath('downloads')` and friends), must say which user
// action triggers it, in a `// tcc-ok: <action>` comment on the same or the preceding line.
//
// Flagged, in non-test source under packages/ and apps/:
//   - a line with a home expression (`homedir()`, `getPath('home')`, `home`, `homeDir`, `${home}`) and a protected
//     folder name as a string literal or path segment next to it
//   - `getPath('downloads'|'documents'|'desktop'|'pictures'|'music'|'videos')`

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FOLDERS = 'Desktop|Documents|Downloads|Pictures|Music|Movies';
const HOME = String.raw`(?:homedir\(\)|getPath\(\s*['"]home['"]\s*\)|\bhome(?:Dir)?\b|\$\{\s*home(?:Dir)?\s*\})`;
const JOINED = new RegExp(String.raw`${HOME}[^\n]*?['"\`/](?:${FOLDERS})\b['"\`/]?`);
const ELECTRON = /getPath\(\s*['"](?:downloads|documents|desktop|pictures|music|videos)['"]\s*\)/;
const MARK = /\/\/\s*tcc-ok:\s*\S/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.git', '.worktrees', 'coverage', 'release']);
const SOURCE = /\.(?:ts|tsx|mjs|cjs|js)$/;
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$|[\\/](?:__fixtures__|e2e|test-support)[\\/]/;

/** Violations in one file's text: `[{ line, text }]`. Exported for the test. */
export function scanSource(text) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    const code = line.replace(/^\s*(?:\/\/|\*|\/\*).*$/, '');
    if (!code.trim()) return;
    if (!(JOINED.test(code) || ELECTRON.test(code))) return;
    if (MARK.test(line) || MARK.test(lines[i - 1] ?? '')) return;
    out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (SOURCE.test(entry.name) && !TEST.test(path.join(dir, entry.name))) {
      yield path.join(dir, entry.name);
    }
  }
}

async function main() {
  const failures = [];
  for (const root of ['packages', 'apps']) {
    for await (const file of walk(path.join(repoRoot, root))) {
      for (const v of scanSource(await readFile(file, 'utf8'))) {
        failures.push(`${path.relative(repoRoot, file)}:${v.line}  ${v.text}`);
      }
    }
  }
  if (failures.length > 0) {
    console.error('tcc-guard: protected-folder access without a `// tcc-ok: <user action>` mark:\n');
    for (const f of failures) console.error(`  ${f}`);
    console.error('\nBoot, timer and background code must not enter a TCC-protected folder. If a user action triggers this line, name it in the mark.');
    process.exit(1);
  }
  console.log('tcc-guard: ok');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
