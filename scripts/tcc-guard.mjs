#!/usr/bin/env node
// tcc-guard: keeps boot and background code out of macOS's protected folders (ISSUES Phase 2 Theme D).
//
// Entering ~/Documents, ~/Desktop, ~/Downloads, ~/Pictures, ~/Music or ~/Movies from a process with no grant
// raises a system prompt, and the packaged app was raising them nobody asked for. A source line that builds
// one of those paths, or asks Electron for one (`app.getPath('downloads')` and friends), must say which user
// action triggers it, in a `// tcc-ok: <action>` comment on the same or the preceding line.
//
// Flagged, in non-test source under packages/ and apps/ (a per-file text heuristic, not a parser):
//   - a home expression followed, within 80 characters and the same statement (no `;`, newlines allowed), by a
//     protected folder name as a string literal or path segment. Home expressions: `homedir()`,
//     `getPath('home')`, `process.env.HOME`, `${home}`, an identifier ending in `home`/`Home`/`homeDir` used as an
//     argument or interpolation (`join(userHome, ...)`), and any `const x = homedir()` alias used the same way
//   - `'~/Documents'` and the other folders spelled with a leading tilde (not a JSX attribute value such as
//     `placeholder="~/Downloads"`, which is display text)
//   - `getPath('downloads'|'documents'|'desktop'|'pictures'|'music'|'videos')`
//
// Known limits, deliberately not chased: a path assembled across statements or in another file (a folder name
// in a constant, joined elsewhere), a home passed through a function parameter with an unrelated name, a folder
// name built by concatenation or `path.sep`, and `//` inside a string literal being read as a comment. This is a
// regression net for the common shapes, not a proof; the real defence is the test that boot code stays out.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Kept in step with `PROTECTED_HOME_FOLDERS` in packages/shared (a test asserts it). */
export const FOLDER_NAMES = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Movies'];
const FOLDERS = FOLDER_NAMES.join('|');
const NAMED_HOME = String.raw`(?:homedir\(\)|getPath\(\s*['"]home['"]\s*\)|process\.env\.HOME\b|\$\{\s*(?:\w*[hH]ome(?:Dir(?:ectory)?)?)\s*\})`;
const HOME_IDENT = String.raw`\b(?:home|\w*Home)(?:Dir(?:ectory)?)?\b\s*[,)]`;
const FOLDER_AFTER = String.raw`[^;]{0,80}?['"\`/](?:${FOLDERS})\b`;
const TILDE = new RegExp(String.raw`(?<![\w-]=)['"\`]~/(?:${FOLDERS})\b`, 'g');
const ELECTRON = /getPath\(\s*['"](?:downloads|documents|desktop|pictures|music|videos)['"]\s*\)/g;
const ALIAS = /\b(?:const|let|var)\s+(\w+)\s*=\s*[^;]*?(?:homedir\(\)|getPath\(\s*['"]home['"]\s*\)|process\.env\.HOME\b)/g;
const MARK = /\/\/\s*tcc-ok:\s*\S/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.git', '.worktrees', 'coverage', 'release']);
const SOURCE = /\.(?:ts|tsx|mjs|cjs|js)$/;
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$|[\\/](?:__fixtures__|e2e|test-support)[\\/]/;

/** Blank out comments, keeping every offset and newline so match positions still map to lines. */
const blankComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length));

/** Violations in one file's text: `[{ line, text }]`. Exported for the test. */
export function scanSource(text) {
  const code = blankComments(text);
  const lines = text.split('\n');
  const aliases = [...code.matchAll(ALIAS)].map((m) => m[1]);
  const aliasHome = aliases.length > 0 ? `|\\b(?:${aliases.join('|')})\\b\\s*[,)]|\\$\\{\\s*(?:${aliases.join('|')})\\s*\\}` : '';
  const joined = new RegExp(`(?:${NAMED_HOME}|${HOME_IDENT}${aliasHome})${FOLDER_AFTER}`, 'g');
  const lineOf = (offset) => code.slice(0, offset).split('\n').length;
  const hits = new Map();
  for (const re of [joined, TILDE, ELECTRON]) {
    for (const m of code.matchAll(re)) {
      const start = lineOf(m.index);
      const end = start + m[0].split('\n').length - 1;
      const marked =
        lines.slice(start - 1, end).some((l) => MARK.test(l)) ||
        (/^\s*\/\//.test(lines[start - 2] ?? '') && MARK.test(lines[start - 2] ?? ''));
      if (!marked) hits.set(start, { line: start, text: lines[start - 1].trim() });
    }
  }
  return [...hits.values()].sort((x, y) => x.line - y.line);
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
