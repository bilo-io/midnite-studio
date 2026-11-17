#!/usr/bin/env node
// retro: automates `midnite-retro` (Phase 151 Theme C). Read-only: only `gh ... list/search/api` GETs.
//   node scripts/skills/retro.mjs <owner | owner/repo | a,b> [1m|3m|6m|1y]
//        [--focus innovation,features,maintenance,fixes] [--author <login>] [--json] [--no-llm]
// The scope is required (the skill asks before it scans; a script takes it as an argument and never guesses).
// Heuristics classify and cluster; Ollama (qwen3.5:9b) only refines novelty scoring and theme names, and every
// path works without it.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mdTable } from './lib/format.mjs';
import * as gh from './lib/gh.mjs';
import { isNoLlm, run as ollama } from './lib/ollama.mjs';
import { retroWindow } from './sast.mjs';

export const MAX_REPOS = 25;
export const CATEGORIES = ['innovation', 'features', 'maintenance', 'fixes'];
const BOT = /(^|[-_/])(dependabot|renovate|github-actions)|\[bot\]$|^app\//i;
const PREFIX = /^(feat|fix|chore|build|ci|refactor|test|tests|docs|deps|perf|style|revert|hotfix)(?:\(([^)]+)\))?(!)?:/i;
const PR_FIELDS = 'number,title,url,mergedAt,author,labels,additions,deletions,changedFiles,body,files';

export const isBot = (author) => BOT.test(typeof author === 'string' ? author : (author?.login ?? '')) || author?.is_bot === true;

/** `owner`, `owner/repo` or a comma list -> `{owners:[], repos:[]}`. */
export function parseScope(text) {
  const owners = [];
  const repos = [];
  for (const part of String(text ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!/^[\w.-]+(\/[\w.-]+)?$/.test(part)) throw new Error(`bad scope "${part}" (owner or owner/repo)`);
    (part.includes('/') ? repos : owners).push(part);
  }
  if (!owners.length && !repos.length) throw new Error('scope required: an owner, owner/repo, or a comma-separated list');
  return { owners, repos };
}

/** Conventional prefix + scope of a title. */
export function prefixOf(title) {
  const m = PREFIX.exec(title ?? '');
  return m ? { type: m[1].toLowerCase(), scope: m[2] ?? null, breaking: Boolean(m[3]) } : { type: null, scope: null, breaking: false };
}

const labelNames = (pr) => (pr.labels ?? []).map((l) => (l.name ?? l).toLowerCase());

/** Primary category + `also` extras. Innovation is orthogonal and decided by `noveltyEvidence`. */
export function classify(pr) {
  const { type } = prefixOf(pr.title);
  const labels = labelNames(pr);
  let primary = 'features';
  if (type === 'fix' || type === 'hotfix' || labels.some((l) => /bug|incident|hotfix/.test(l))) primary = 'fixes';
  else if (['chore', 'build', 'ci', 'refactor', 'test', 'tests', 'docs', 'deps', 'style', 'revert'].includes(type) || labels.some((l) => /dependenc|chore|maintenance/.test(l))) primary = 'maintenance';
  else if (type === 'perf') primary = 'maintenance';
  return primary;
}

/** Evidence-based novelty (the skill's rule: evidence, not adjectives). Returns `string|null`. */
export function noveltyEvidence(pr) {
  const body = String(pr.body ?? '').split('\n').slice(0, 40).join('\n');
  const files = (pr.files ?? []).map((f) => f.path ?? f);
  const newTop = files.find((f) => /^(?:packages|apps)\/[^/]+\/package\.json$/.test(f));
  if (newTop && /^feat/i.test(pr.title)) return `new package manifest ${newTop}`;
  const measured = /(\d+(?:\.\d+)?\s?[x×]\s+(?:faster|smaller|less)|[-−]\s?\d+\s?%|\d+\s?(?:ms|s|min|minutes?)\s*(?:→|->|to)\s*\d+\s?(?:ms|s|seconds?))/i.exec(body);
  if (measured) return `measured: ${measured[0].trim()}`;
  if (/\b(spike|prototype|rfc|adr|experiment(?:al)?|proof of concept)\b/i.test(`${pr.title}\n${body}`)) return 'explicitly exploratory';
  const contrast = /\b(replaces?|instead of|rather than)\b[^.\n]{3,80}/i.exec(body);
  if (contrast && /^feat|^perf|^refactor/i.test(pr.title)) return `different approach: ${contrast[0].trim().slice(0, 80)}`;
  return null;
}

/** Normalise raw gh PR rows: drop bots (counted), tag prefix/category/novelty. */
export function prepare(rawPrs, repo, { authors } = {}) {
  let bots = 0;
  const prs = [];
  for (const p of rawPrs) {
    if (isBot(p.author)) {
      bots++;
      continue;
    }
    const login = p.author?.login ?? '—';
    if (authors?.length && !authors.includes(login)) continue;
    const pre = prefixOf(p.title);
    prs.push({
      repo,
      number: p.number,
      title: p.title,
      url: p.url,
      mergedAt: p.mergedAt,
      author: login,
      additions: p.additions ?? 0,
      deletions: p.deletions ?? 0,
      ...pre,
      category: classify(p),
      novelty: noveltyEvidence(p),
      phase: /phase[\s-]*(\d+)/i.exec(`${p.title} ${p.body ?? ''}`)?.[1] ?? null,
    });
  }
  return { prs, bots };
}

/** Cluster by phase ref, then conventional scope; groups need >= 2 PRs. Singletons stay standalone. */
export function group(prs) {
  const groups = [];
  const used = new Set();
  const take = (keyFn, kind) => {
    const buckets = new Map();
    for (const p of prs) {
      if (used.has(p)) continue;
      const k = keyFn(p);
      if (k) buckets.set(k, [...(buckets.get(k) ?? []), p]);
    }
    for (const [k, members] of buckets) {
      if (members.length < 2) continue;
      members.forEach((m) => used.add(m));
      groups.push({ key: k, kind, name: kind === 'phase' ? `Phase ${k}` : k, prs: members });
    }
  };
  take((p) => p.phase, 'phase');
  take((p) => p.scope?.toLowerCase(), 'scope');
  return { groups, standalone: prs.filter((p) => !used.has(p)) };
}

/** Collapse bot counts into one Maintenance line per repo. */
export const botLine = (repo, n) => (n > 0 ? `${repo}: ${n} dependency/automation PR${n === 1 ? '' : 's'} (not listed)` : null);

/** Parse a model's JSON reply (tolerates a fenced block). `null` on anything unusable. */
export function parseModelJson(text) {
  const m = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  try {
    return JSON.parse((m ? m[1] : text).trim());
  } catch {
    return null;
  }
}

/**
 * Optional LLM pass: score novelty (evidence required) and name the groups. Never throws; on no daemon /
 * bad JSON the heuristics stand untouched.
 */
export async function llmRefine(prs, groups, { noLlm, ...opts } = {}) {
  if (!prs.length) return { source: 'fallback', reason: 'empty' };
  const prompt = [
    'You are scoring merged pull requests for a retrospective. Reply with JSON only:',
    '{"novel":[{"i":<index>,"evidence":"<concrete evidence, max 25 words>"}],"themes":[{"ids":[<indexes>],"name":"<theme name>"}]}',
    'A PR is novel ONLY with evidence: first of its kind, new technology, different approach, measured number, enabling work, or exploratory. Prefer an empty list to padding.',
    ...prs.map((p, i) => `${i}. [${p.repo}] ${p.title}`),
  ].join('\n');
  const res = await ollama({ task: 'classify', prompt, noLlm, fallback: () => null, ...opts });
  if (res.source !== 'ollama') return { source: 'fallback', reason: res.reason };
  const json = parseModelJson(res.text);
  if (!json) return { source: 'fallback', reason: 'bad-json' };
  for (const n of json.novel ?? []) {
    const p = prs[n.i];
    if (p && n.evidence && !p.novelty) p.novelty = String(n.evidence).slice(0, 160);
  }
  for (const t of json.themes ?? []) {
    const ids = (t.ids ?? []).filter((i) => prs[i]);
    const g = groups.find((x) => ids.length > 1 && ids.every((i) => x.prs.includes(prs[i])));
    if (g && t.name) g.name = String(t.name).slice(0, 60);
  }
  return { source: 'ollama', model: res.model };
}

/** Everything gh: repos in scope -> prepared PRs. `ghApi` injectable. */
export async function harvest(scope, win, { ghApi = gh, authors, notes = [] } = {}) {
  const repos = [...scope.repos];
  for (const owner of scope.owners) {
    const r = await ghApi.ghJson(['repo', 'list', owner, '--no-archived', '--limit', '300', '--json', 'nameWithOwner,pushedAt,isFork']);
    if (!r.ok) {
      notes.push(`could not list ${owner} (${r.kind})`);
      continue;
    }
    const active = r.data.filter((x) => !x.isFork && x.pushedAt >= win.start).map((x) => x.nameWithOwner);
    let keep = active;
    if (active.length > MAX_REPOS) {
      const counts = await ghApi.ghJson(['search', 'prs', '--owner', owner, '--merged-at', `>=${win.start}`, '--limit', '1000', '--json', 'repository']);
      const n = new Map();
      for (const x of counts.ok ? counts.data : []) n.set(x.repository?.nameWithOwner, (n.get(x.repository?.nameWithOwner) ?? 0) + 1);
      keep = [...active].sort((a, b) => (n.get(b) ?? 0) - (n.get(a) ?? 0)).slice(0, MAX_REPOS);
      notes.push(`${owner}: ${active.length - MAX_REPOS} least-active repos left out`);
    }
    repos.push(...keep);
  }
  const out = { prs: [], bots: [], releases: [], repos: [...new Set(repos)] };
  for (const repo of out.repos) {
    const r = await ghApi.ghJson(['pr', 'list', '--repo', repo, '--state', 'merged', '--limit', '500', '--search', `merged:${win.start}..${win.end}`, '--json', PR_FIELDS]);
    if (!r.ok) {
      notes.push(`${repo}: ${r.kind}`);
      continue;
    }
    const { prs, bots } = prepare(r.data ?? [], repo, { authors });
    out.prs.push(...prs);
    const line = botLine(repo, bots);
    if (line) out.bots.push(line);
    const rel = await ghApi.ghJson(['release', 'list', '--repo', repo, '--limit', '50', '--json', 'tagName,name,publishedAt']);
    if (rel.ok) out.releases.push(...rel.data.filter((x) => x.publishedAt >= win.start).map((x) => ({ repo, ...x })));
  }
  return out;
}

const ICON = { innovation: '💡', features: '✨', maintenance: '🧹', fixes: '🐛' };
const TITLE = { innovation: 'Innovation / novel', features: 'Features', maintenance: 'Maintenance', fixes: 'Fixes & reliability' };
const ref = (p) => `[${p.repo}#${p.number}](${p.url})`;

export function renderMarkdown({ scopeLabel, win, focus, prs, groups, standalone, bots, releases, repos }) {
  const authors = new Set(prs.map((p) => p.author)).size;
  const botTotal = bots.reduce((s, l) => s + Number(/: (\d+) /.exec(l)?.[1] ?? 0), 0);
  const out = [
    `# 🔭 Retro — ${scopeLabel} · ${win.start} → ${win.end}`,
    '',
    `${prs.length} PRs merged across ${repos.length} repos · ${releases.length} releases · by ${authors} authors · ${botTotal} dependency bumps`,
    '',
    '## 🗂️ What shipped',
  ];
  const cats = focus.filter((c) => c !== 'innovation');
  for (const c of cats) {
    out.push('', `### ${ICON[c]} ${TITLE[c]}`);
    const gs = groups.filter((g) => g.prs[0].category === c);
    const ss = standalone.filter((p) => p.category === c);
    for (const g of gs) {
      const span = g.prs.map((p) => p.mergedAt).sort();
      out.push(`- **${g.name}** — ${[...new Set(g.prs.map((p) => p.repo))].join(', ')} · ${g.prs.length} PRs · ${span[0]?.slice(0, 10)} → ${span.at(-1)?.slice(0, 10)}`);
      for (const p of g.prs) out.push(`  - ${ref(p)} ${p.title}${p.novelty && focus.includes('innovation') ? ' · also: innovation' : ''}`);
    }
    for (const p of ss) out.push(`- ${ref(p)} ${p.title}${p.novelty && focus.includes('innovation') ? ' · also: innovation' : ''}`);
    if (c === 'maintenance') for (const l of bots) out.push(`- ${l}`);
    if (!gs.length && !ss.length && !(c === 'maintenance' && bots.length)) out.push('— nothing in range');
  }
  out.push('', '## 📝 Summary');
  if (focus.includes('innovation')) {
    out.push('', `### ${ICON.innovation} ${TITLE.innovation}`);
    const nov = prs.filter((p) => p.novelty).slice(0, 7);
    out.push(...(nov.length ? nov.map((p) => `- **${p.title}** — why novel: ${p.novelty} (${ref(p)})`) : ['— nothing with evidence']));
  }
  for (const c of cats) {
    out.push('', `### ${ICON[c]} ${TITLE[c]}`);
    const top = [...groups.filter((g) => g.prs[0].category === c).map((g) => ({ k: g.prs.length, t: `**${g.name}** — ${g.prs.length} PRs (${ref(g.prs[0])}…)` })), ...standalone.filter((p) => p.category === c).map((p) => ({ k: p.additions + p.deletions > 500 ? 2 : 1, t: `**${p.title}** (${ref(p)})` }))]
      .sort((a, b) => b.k - a.k)
      .slice(0, 7);
    out.push(...(top.length ? top.map((x) => `- ${x.t}`) : ['— nothing in range']));
  }
  if (releases.length) out.push('', '### 📦 Releases', mdTable(['Repo', 'Tag', 'Published'], releases.map((r) => [r.repo, r.tagName, String(r.publishedAt).slice(0, 10)])));
  const top = groups[0]?.name ?? standalone[0]?.title ?? 'quiet window';
  out.push('', `**Headline:** ${prs.length} PRs across ${repos.length} repos; led by ${top}.`);
  return out.join('\n');
}

export function parseArgs(argv) {
  const o = { scope: undefined, span: '1m', focus: [...CATEGORIES], authors: [], json: false, noLlm: isNoLlm(argv, {}) };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') o.json = true;
    else if (a === '--focus') o.focus = argv[++i].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    else if (a === '--author') o.authors.push(...argv[++i].split(','));
    else if (/^(1m|3m|6m|1y)$/.test(a)) o.span = a;
    else if (!a.startsWith('--') && o.scope === undefined) o.scope = a;
  }
  return o;
}

export async function main(argv = process.argv.slice(2), now = new Date()) {
  const o = parseArgs(argv);
  const scope = parseScope(o.scope);
  const win = retroWindow(o.span, now);
  const notes = [];
  const h = await harvest(scope, win, { authors: o.authors, notes });
  const { groups, standalone } = group(h.prs);
  const llm = await llmRefine(h.prs, groups, { noLlm: o.noLlm });
  const view = { scopeLabel: o.scope, win, focus: o.focus, ...h, groups, standalone };
  if (o.json) console.log(JSON.stringify({ ...view, llm, notes }, null, 2));
  else console.log(renderMarkdown(view));
  for (const n of notes) console.error(`note: ${n}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(1); });
}
