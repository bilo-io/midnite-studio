#!/usr/bin/env node
// PR body section editor (Phase 151 Theme H): idempotent replace-or-append of one `##` section, then
// `gh pr edit --body-file`. Fenced code blocks are skipped when finding headings. Other sections are
// left byte-for-byte alone.
//
//   node scripts/skills/pr-body.mjs <pr> --set-section "<heading>" (--file f | --text s) [--append]
//        [--dry-run] [--json] [--no-llm]
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultRun, prView } from './lib/gh.mjs';
import { REPO, arg, biloToken } from './lib/pr-common.mjs';

const norm = (h) => h.replace(/^#+\s*/, '').trim().toLowerCase();

/** `[{title,start,end}]` of every `##` section (end exclusive, line indexes), ignoring fenced code. */
export function sections(lines) {
  const out = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && /^##\s+\S/.test(l)) {
      if (out.length) out[out.length - 1].end = i;
      out.push({ title: l.replace(/^##\s+/, '').trim(), start: i, end: lines.length });
    }
  });
  return out;
}

/** Replace (or, with `append`, extend) the `## heading` section, adding it at the end when missing. */
export function setSection(body, heading, content, { append = false } = {}) {
  const lines = String(body ?? '').replace(/\r\n/g, '\n').split('\n');
  const text = content.replace(/\s+$/, '');
  const sec = sections(lines).find((s) => norm(s.title) === norm(heading));
  const title = heading.replace(/^#+\s*/, '').trim();
  if (!sec) {
    const base = lines.join('\n').replace(/\s+$/, '');
    return `${base}${base ? '\n\n' : ''}## ${title}\n\n${text}\n`;
  }
  const existing = lines.slice(sec.start + 1, sec.end).join('\n').trim();
  let inner = text;
  if (append) inner = existing.split('\n').some((l) => l.trim() === text.trim()) ? existing : `${existing}${existing ? '\n' : ''}${text}`;
  const before = lines.slice(0, sec.start);
  const after = lines.slice(sec.end);
  return [...before, `## ${sec.title}`, '', ...inner.split('\n'), '', ...after].join('\n').replace(/\n{3,}(?=## )/g, '\n\n').replace(/\s*$/, '\n');
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('usage: pr-body.mjs <pr> --set-section "<heading>" (--file f | --text s) [--append] [--dry-run] [--json] [--no-llm]\n');
    return 0;
  }
  const n = argv.find((a) => /^\d+$/.test(a));
  const heading = arg(argv, '--set-section');
  const file = arg(argv, '--file');
  const text = arg(argv, '--text');
  if (!n || !heading || (file === undefined) === (text === undefined)) {
    process.stderr.write('usage: pr-body.mjs <pr> --set-section "<heading>" (--file f | --text s) [--append] [--dry-run]\n');
    return 2;
  }
  const content = file !== undefined ? (deps.readFile ?? readFileSync)(file, 'utf8') : text;
  const run = deps.ghRun ?? defaultRun;
  const o = { repo: REPO, env: { GH_TOKEN: deps.token ?? biloToken() }, run };
  const view = await prView(n, { ...o, fields: 'body' });
  if (!view.ok) {
    process.stderr.write(`gh: ${view.kind}: ${view.message}\n`);
    return 1;
  }
  const body = setSection(view.data.body ?? '', heading, content, { append: argv.includes('--append') });
  const changed = body.trim() !== String(view.data.body ?? '').replace(/\r\n/g, '\n').trim();
  if (argv.includes('--dry-run')) {
    process.stdout.write(argv.includes('--json') ? `${JSON.stringify({ pr: Number(n), changed, body })}\n` : body);
    return 0;
  }
  if (changed) {
    const path = join(mkdtempSync(join(tmpdir(), 'pr-body-')), 'body.md');
    (deps.writeFile ?? writeFileSync)(path, body);
    try {
      await run(['pr', 'edit', n, '--body-file', path, '--repo', REPO], { env: o.env });
    } catch (e) {
      process.stderr.write(`gh pr edit: ${String(e?.stderr || e?.message || e).trim()}\n`);
      return 1;
    }
  }
  process.stdout.write(argv.includes('--json') ? `${JSON.stringify({ pr: Number(n), changed })}\n` : `${changed ? 'updated' : 'unchanged'}: ## ${heading} on #${n}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => process.exit(c));
