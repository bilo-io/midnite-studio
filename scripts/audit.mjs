#!/usr/bin/env node
// audit: fail on any high/critical `pnpm audit` advisory that is not covered by an
// unexpired entry in scripts/audit-suppressions.json (Phase 91 Theme I).
//
// A suppression is { advisory, package, reason, expires }. An expired entry fails the
// gate by itself, so a suppression can never quietly become permanent. `advisory`
// matches either the GHSA id or pnpm's numeric id. Pure logic is exported for the test;
// the CLI shells out to `pnpm audit --json --audit-level=high` (needs the registry, not
// an install).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FAILING = new Set(['high', 'critical']);

/** Flatten pnpm's `advisories` map into [{ id, ghsa, module, severity, title }]. */
export function readAdvisories(report) {
  const out = [];
  for (const [key, a] of Object.entries(report?.advisories ?? {})) {
    out.push({
      id: String(a.id ?? key),
      ghsa: a.github_advisory_id ? String(a.github_advisory_id) : undefined,
      module: a.module_name ?? 'unknown',
      severity: a.severity ?? 'unknown',
      title: a.title ?? '',
    });
  }
  return out;
}

/**
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function evaluate(report, suppressions, now = new Date()) {
  const problems = [];
  const live = [];
  for (const s of suppressions) {
    const expires = new Date(s.expires);
    if (Number.isNaN(expires.getTime())) {
      problems.push(`suppression ${s.advisory} has no valid "expires" date`);
    } else if (expires.getTime() < now.getTime()) {
      problems.push(`suppression ${s.advisory} (${s.package}) expired on ${s.expires}: ${s.reason}`);
    } else {
      live.push(s);
    }
  }
  const covered = new Set(live.flatMap((s) => [String(s.advisory)]));
  for (const a of readAdvisories(report)) {
    if (!FAILING.has(a.severity)) continue;
    if (covered.has(a.id) || (a.ghsa && covered.has(a.ghsa))) continue;
    problems.push(`unsuppressed ${a.severity} advisory ${a.ghsa ?? a.id} in ${a.module}: ${a.title}`);
  }
  const unique = [...new Set(problems)];
  return { ok: unique.length === 0, problems: unique };
}

function runPnpmAudit() {
  try {
    return execFileSync('pnpm', ['audit', '--json', '--audit-level=high'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // pnpm audit exits non-zero when it finds advisories; the JSON is still on stdout.
    if (err.stdout) return String(err.stdout);
    throw err;
  }
}

function main() {
  const suppressions = JSON.parse(readFileSync(path.join(here, 'audit-suppressions.json'), 'utf8'));
  const report = JSON.parse(runPnpmAudit());
  const { ok, problems } = evaluate(report, suppressions);
  if (!ok) {
    for (const p of problems) console.error(`audit: ${p}`);
    process.exit(1);
  }
  console.log('audit: OK — no unsuppressed high or critical advisories');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
