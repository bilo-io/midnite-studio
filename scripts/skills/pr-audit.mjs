#!/usr/bin/env node
// PR audit extractor (Phase 151 Theme D): lays out the four levels midnite-pr-audit compares and
// the contract the PR puts on the wire, as JSON. L1 phase doc (theme checkboxes + Contract row),
// L2 linked issue, L3 PR body claims, L4 the diff (changed files, channel constants, zod schemas).
// Read-only; the judgement (drift, claims vs evidence) stays with the reviewer, this only surfaces
// the mechanical mismatches.
//
//   node scripts/skills/pr-audit.mjs <pr> [--json]
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prView } from './lib/gh.mjs';
import { countByTheme } from './lib/tasks-index.mjs';
import { REPO, biloToken, phaseFromBranch } from './lib/pr-common.mjs';
import { parseDiff } from './pr-review-lint.mjs';

/** L4: channel constants and zod schemas on added lines of the wire-contract files. */
export function extractContract(files) {
  const channels = [];
  const schemas = [];
  for (const f of files) {
    if (!/\.[cm]?[jt]sx?$/.test(f.file)) continue;
    const isChannels = /(^|\/)channels\.ts$/.test(f.file);
    for (const a of f.added) {
      if (isChannels) {
        const m = /^\s*(?:export\s+const\s+)?([A-Za-z0-9_]+)\s*[:=]\s*['"`]([\w:.-]+)['"`]/.exec(a.text) ?? /^\s*([A-Za-z0-9_]+):\s*['"`]([\w:.-]+)['"`]/.exec(a.text);
        if (m) channels.push({ name: m[1], channel: m[2], file: f.file, line: a.line });
      }
      const s = /export\s+const\s+([A-Za-z0-9_]+Schema)\s*=\s*z\./.exec(a.text);
      if (s && /shared\/src\//.test(f.file)) schemas.push({ name: s[1], file: f.file, line: a.line });
    }
  }
  return { channels, schemas };
}

/** L3: claims in the PR body that the diff should be able to back. */
export function extractClaims(body) {
  const claims = [];
  const text = body ?? '';
  if (/\b(tested|tests? (added|pass)|covered)\b/i.test(text)) claims.push('tested');
  if (/\b(unchanged|no behaviou?r change|no functional change)\b/i.test(text)) claims.push('unchanged');
  return claims;
}

/** L1: the phase's theme checkbox counts and Contract row, from the phase doc text. */
export function parsePhaseDoc(text) {
  const contract = /^\|?\s*\*{0,2}Contract\*{0,2}\s*\|(.+)$/im.exec(text)?.[1]?.trim() ?? null;
  return { contract, themes: countByTheme(text) };
}

/** Mechanical mismatches between the levels. */
export function crossCheck({ claims, files, contract, closing }) {
  const findings = [];
  const touched = files.map((f) => f.file);
  if (claims.includes('tested') && !touched.some((f) => /\.(test|spec)\./.test(f))) findings.push({ level: 'L3-L4', severity: 'WARNING', message: 'Body claims tests, but the diff touches no test file.' });
  if (claims.includes('unchanged') && contract.channels.length + contract.schemas.length > 0) findings.push({ level: 'L3-L4', severity: 'WARNING', message: 'Body claims no change, but the diff adds channels or schemas.' });
  if (closing.length === 0) findings.push({ level: 'L2-L3', severity: 'NIT', message: 'PR links no closing issue.' });
  return findings;
}

export function findPhaseDoc(root, phase) {
  for (const cat of ['FEATURES', 'SECURITY', 'ISSUES']) {
    const dir = join(root, '.midnite/tasks', cat, 'phases');
    try {
      const f = readdirSync(dir).find((n) => n.startsWith(`phase-${phase}-`));
      if (f) return join(dir, f);
    } catch {
      /* category absent */
    }
  }
  return null;
}

export async function main(argv = process.argv.slice(2), { root = process.cwd(), ghRun } = {}) {
  const n = argv.find((a) => /^\d+$/.test(a));
  if (!n) {
    process.stderr.write('usage: pr-audit.mjs <pr> [--json]\n');
    return 2;
  }
  const env = { GH_TOKEN: biloToken() };
  const view = await prView(n, { repo: REPO, env, run: ghRun, fields: 'number,title,body,headRefName,baseRefName,closingIssuesReferences' });
  if (!view.ok) {
    process.stderr.write(`gh: ${view.kind}: ${view.message}\n`);
    return 1;
  }
  const pr = view.data;
  const diff = execFileSync('gh', ['pr', 'diff', n, '--repo', REPO], { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  const files = parseDiff(diff);
  const { phase } = phaseFromBranch(pr.headRefName);
  const docPath = phase ? findPhaseDoc(root, phase) : null;
  const L1 = docPath ? { path: docPath, ...parsePhaseDoc(readFileSync(docPath, 'utf8')) } : null;
  const closing = pr.closingIssuesReferences ?? [];
  const L4 = { files: files.map((f) => f.file), ...extractContract(files) };
  const claims = extractClaims(pr.body);
  const out = { pr: Number(n), L1, L2: closing, L3: { title: pr.title, claims }, L4, findings: crossCheck({ claims, files, contract: L4, closing }) };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c));
