#!/usr/bin/env node
// Classify test / CI failures (Phase 151 Theme E) — regex first, a local model only for what regex cannot place.
//
//   node scripts/skills/test-classify.mjs [log-file | -] [--json] [--no-llm]
//
// Categories: boundary (eslint no-restricted-imports / layer rules), ts (TSxxxx), index-lock (git index.lock
// race), auth (401/403/bad credentials/registry token), timeout, billing (Actions budget — not a code failure),
// assertion (vitest/playwright expectation), other. Reads a log from a file or stdin.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isNoLlm, run as llm } from './lib/ollama.mjs';

/** Ordered: first match wins, so specific causes beat generic ones. */
export const RULES = [
  { kind: 'billing', re: /budget is preventing further use|job was not started because/i, hint: 'Actions billing lock — not a code failure; merge on the local gate or raise the budget.' },
  { kind: 'index-lock', re: /index\.lock|Unable to create '.*\.lock'|another git process seems to be running/i, hint: 'A git write bypassed the per-repo write queue (git-engine/src/exec/write-queue.ts).' },
  { kind: 'boundary', re: /no-restricted-imports|restricted from being imported|layer[- ]boundar|boundary rule|may not import/i, hint: 'A package boundary fired: the fix is an IPC channel or a host port, not an eslint exception.' },
  { kind: 'ts', re: /\bTS\d{4}\b|error TS|Type '.*' is not assignable|Property '.*' does not exist on type/i, hint: 'Type error — run the owning package typecheck.' },
  { kind: 'auth', re: /\b40[13]\b.*(?:Unauthorized|Forbidden)|Bad credentials|GITHUB_PACKAGES_TOKEN|requires authentication|ERR_PNPM_FETCH_40[13]|authentication failed|SAML/i, hint: 'Credential problem — export GITHUB_PACKAGES_TOKEN / gh auth refresh; a rerun will not help.' },
  { kind: 'timeout', re: /ETIMEDOUT|timed? ?out|Timeout \d+ms exceeded|exceeded timeout|ECONNRESET|socket hang up/i, hint: 'Timeout — rerun once; if it repeats it is load or a missing settle().' },
  { kind: 'assertion', re: /AssertionError|expect\(.*\)\.(?:to|not)|Expected:|Received:|toMatchSnapshot|toHaveScreenshot/i, hint: 'A real expectation failed — read the diff.' },
];

export const FLAKY = new Set(['timeout', 'index-lock']);

/** Classify one block of text (a log line or a failure block). */
export function classifyText(text) {
  for (const r of RULES) if (r.re.test(text)) return { kind: r.kind, hint: r.hint, source: 'regex' };
  return null;
}

/** Split a log into failure blocks: a line mentioning FAIL/ERROR/✗/× opens one, up to the next blank line. */
export function failureBlocks(log) {
  const blocks = [];
  let cur = null;
  for (const line of String(log).split('\n')) {
    if (/\b(?:FAIL|ERROR|Error:|✗|×|failed)\b|^\s*error\b/.test(line)) {
      cur = { line: line.trim().slice(0, 200), text: line };
      blocks.push(cur);
    } else if (cur && line.trim()) cur.text += `\n${line}`;
    else cur = null;
  }
  return blocks;
}

/** Classify every failure block; blocks regex cannot place go to the model (task `classify`), else `other`. */
export async function classifyLog(log, { noLlm = isNoLlm(), fetch, url } = {}) {
  const out = [];
  for (const b of failureBlocks(log)) {
    let c = classifyText(b.text);
    if (!c) {
      const kinds = [...RULES.map((r) => r.kind), 'other'];
      const r = await llm({
        task: 'classify',
        prompt: `Classify this test failure as exactly one of: ${kinds.join(', ')}. Reply with the word only.\n\n${b.text.slice(0, 1500)}`,
        fallback: () => 'other',
        noLlm,
        fetch,
        url,
      });
      const word = String(r.text).trim().toLowerCase().split(/\s+/)[0];
      const kind = kinds.includes(word) ? word : 'other';
      c = { kind, hint: RULES.find((x) => x.kind === kind)?.hint ?? 'Unclassified — read the log.', source: r.source === 'ollama' && kind !== 'other' ? 'ollama' : 'fallback' };
    }
    out.push({ line: b.line, ...c, flaky: FLAKY.has(c.kind) });
  }
  return out;
}

export function summarise(items) {
  const byKind = {};
  for (const i of items) byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  return { total: items.length, byKind, rerunWorthy: items.length > 0 && items.every((i) => i.flaky) };
}

export async function main(argv = process.argv.slice(2), out = (s) => process.stdout.write(`${s}\n`)) {
  const file = argv.find((a) => !a.startsWith('--'));
  const log = file && file !== '-' ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
  const items = await classifyLog(log, { noLlm: isNoLlm(argv) });
  const sum = summarise(items);
  if (argv.includes('--json')) out(JSON.stringify({ ...sum, items }, null, 2));
  else {
    out(`${sum.total} failure(s): ${Object.entries(sum.byKind).map(([k, n]) => `${k} ${n}`).join(' · ') || 'none'}${sum.rerunWorthy ? ' · rerun once' : ''}`);
    for (const i of items) out(`- [${i.kind}] ${i.line}\n    ${i.hint}`);
  }
  return items.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => { process.exitCode = c; });
