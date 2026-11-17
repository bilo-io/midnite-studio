// Shared by release-prep.mjs / release-complete.mjs (Phase 151 Theme C). Pure functions + thin fs wrappers;
// every git/gh call goes through an injected runner so the scripts never tag, push or publish in tests.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const APPS_REPO = 'bilo-io/midnite-apps';
export const STUDIO_REPO = 'bilo-io/midnite-studio';

/** Load the BUILT shared package (`moon run shared:build`); the planner has no .mjs twin on purpose. */
export async function loadShared(root = repoRoot) {
  const load = (f) => import(pathToFileURL(path.join(root, 'packages/shared/dist', f)).href);
  try {
    return { ...(await load('version.js')), ...(await load('release.js')) };
  } catch (e) {
    throw new Error(`packages/shared is not built (${e.code ?? e.message}); run \`moon run shared:build\` first`);
  }
}

/** Root + packages/* + apps/* package.json files -> `[{name, dir, file, version}]` (dir '' = root). */
export function readWorkspace(root = repoRoot) {
  const out = [];
  const add = (dir, fallback) => {
    const file = path.join(root, dir, 'package.json');
    if (!existsSync(file)) return;
    let json = {};
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      /* unreadable -> version null, surfaced by version-check */
    }
    out.push({ name: typeof json.name === 'string' ? json.name : fallback, dir, file, version: typeof json.version === 'string' ? json.version : null });
  };
  add('', 'package.json (root)');
  for (const group of ['packages', 'apps']) {
    const entries = existsSync(path.join(root, group)) ? readdirSync(path.join(root, group), { withFileTypes: true }) : [];
    for (const e of entries.filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) add(`${group}/${e.name}`, `${group}/${e.name}`);
  }
  return out;
}
export const versionMap = (ws) => Object.fromEntries(ws.filter((w) => w.version).map((w) => [w.name, w.version]));

/** Map changed file paths onto workspace package names (longest dir prefix; unmatched -> root). */
export function changedPackages(files, ws) {
  const dirs = ws.filter((w) => w.dir).sort((a, b) => b.dir.length - a.dir.length);
  const root = ws.find((w) => !w.dir);
  const hit = new Set();
  for (const f of files) {
    const w = dirs.find((d) => f === d.dir || f.startsWith(`${d.dir}/`));
    if (w) hit.add(w.name);
    else if (root) hit.add(root.name);
  }
  return [...hit];
}

/** `git log` records -> ConventionalCommit | null, keeping the raw subject for the uncategorised report. */
export function parseCommits(records, shared) {
  return records.map((r) => {
    const message = r.body ? `${r.subject}\n\n${r.body}` : r.subject;
    return { sha: r.sha, subject: r.subject, parsed: shared.parseConventionalCommit(message) };
  });
}

/** Version string rules the skill pins. */
export const isVersion = (v) => /^\d+\.\d+\.\d+$/.test(v);
export const branchFor = (version) => `release/v${version}`;

/** Replace only the top-level `"version"` of a package.json, preserving all formatting. */
export function bumpPackageJson(text, version) {
  const re = /("version"\s*:\s*")[^"]*(")/;
  if (!re.test(text)) throw new Error('package.json has no "version" field');
  return text.replace(re, `$1${version}$2`);
}

const SECTIONS = ['Added', 'Changed', 'Fixed', 'Removed'];
const TYPE_TO_SECTION = { feat: 'Added', fix: 'Fixed', refactor: 'Changed', perf: 'Changed', revert: 'Removed' };

/** Deterministic Keep-a-Changelog body from parsed commits (user-facing types only; breaking first). */
export function draftSection(commits) {
  const by = Object.fromEntries(SECTIONS.map((s) => [s, []]));
  const breaking = [];
  for (const c of commits) {
    const p = c.parsed;
    if (!p) continue;
    const section = TYPE_TO_SECTION[p.type];
    if (!section) continue;
    const line = `- ${p.scope ? `**${p.scope}**: ` : ''}${p.description ?? c.subject}`;
    if (p.breaking) breaking.push(`- **BREAKING** ${line.slice(2)}`);
    by[section].push(line);
  }
  const out = [];
  if (breaking.length) out.push('### ⚠ Breaking', ...breaking, '');
  for (const s of SECTIONS) if (by[s].length) out.push(`### ${s}`, ...by[s], '');
  return out.join('\n').trim();
}

/** A model-drafted body is accepted only if it is Keep-a-Changelog shaped; otherwise null (use the deterministic one). */
export function acceptDraft(text) {
  const t = String(text ?? '').replace(/^```(?:markdown|md)?\n?|\n?```$/g, '').trim();
  if (!t) return null;
  const heads = [...t.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
  if (!heads.length || !heads.every((h) => SECTIONS.includes(h) || /breaking/i.test(h))) return null;
  if (!t.startsWith('### ') || /^## /m.test(t)) return null;
  return t;
}

export const lockstepStub = (displayName) => `### Changed\n- Released in lockstep with the suite; no changes specific to ${displayName}.`;

/**
 * Move `## [Unreleased]` content (or `draft` when that is empty) into `## [version] - date`, re-seed an empty
 * Unreleased stub and refresh the link refs. Pure.
 */
export function applyChangelog(md, { version, date, draft, prevVersion, repoUrl = `https://github.com/${STUDIO_REPO}` }) {
  const lines = md.split('\n');
  const u = lines.findIndex((l) => /^## \[Unreleased\]/i.test(l));
  if (u < 0) throw new Error('CHANGELOG has no ## [Unreleased] heading');
  let end = lines.findIndex((l, i) => i > u && /^## \[/.test(l));
  if (end < 0) end = lines.findIndex((l, i) => i > u && /^\[[^\]]+\]:\s*\S+/.test(l));
  if (end < 0) end = lines.length;
  const existing = lines.slice(u + 1, end).join('\n').trim();
  const body = existing || draft || '';
  const next = [...lines.slice(0, u + 1), '', `## [${version}] - ${date}`, '', body, '', ...lines.slice(end)];
  let out = next.join('\n').replace(/\n{3,}/g, '\n\n');
  const tagRef = `[${version}]: ${repoUrl}/releases/tag/v${version}`;
  if (/^\[Unreleased\]:/m.test(out)) {
    out = out.replace(/^\[Unreleased\]:.*$/m, `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD\n${tagRef}`);
  } else if (!out.includes(tagRef)) out = `${out.replace(/\n*$/, '\n')}\n[Unreleased]: ${repoUrl}/compare/v${version}...HEAD\n${tagRef}\n`;
  void prevVersion;
  return out;
}

/** Read the file text if it exists. */
export const readText = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : null);
export const writeText = (file, text) => writeFileSync(file, text);
