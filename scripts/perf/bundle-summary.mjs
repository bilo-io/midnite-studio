#!/usr/bin/env node
/**
 * Markdown for the CI `perf-report` job's step summary (Phase 77 Theme D).
 *
 *   node scripts/perf/bundle-report.mjs --json | node scripts/perf/bundle-summary.mjs >> "$GITHUB_STEP_SUMMARY"
 *
 * Reads `bundle-report.mjs --json` on stdin and the budgets from `budgets.json`, and prints the
 * entry/total numbers against their budgets plus the ten biggest chunks. It reports; it never
 * exits non-zero for a breach (the job is non-blocking by design — see the README).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const budgets = JSON.parse(readFileSync(join(HERE, 'budgets.json'), 'utf8'));
const report = JSON.parse(readFileSync(0, 'utf8'));

const kb = (n) => `${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KB`;
const verdict = (value, budget) => (value > budget ? `🔴 over by ${kb(value - budget)}` : '🟢 within');

const lines = [
  '### Renderer bundle (Studio, `packages/app/dist`)',
  '',
  '| Measure | Measured | Budget | |',
  '|---|---:|---:|---|',
  `| Entry chunk | ${kb(report.entry.kb)} | ${kb(budgets.entryKb)} | ${verdict(report.entry.kb, budgets.entryKb)} |`,
  `| Total JS (${report.chunks} chunks) | ${kb(report.totalJsKb)} | ${kb(budgets.totalJsKb)} | ${verdict(report.totalJsKb, budgets.totalJsKb)} |`,
  '',
  '| Largest chunks | Size |',
  '|---|---:|',
  ...report.top.map((chunk) => `| \`${chunk.file}\` | ${kb(chunk.kb)} |`),
  '',
  '_Report only: this job never fails the check. Budgets live in `scripts/perf/budgets.json`._',
];
process.stdout.write(`${lines.join('\n')}\n`);
