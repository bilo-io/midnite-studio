#!/usr/bin/env node
// tracker: the phase tracker on the forge, as one CLI (Phase 151 Theme G). The skills call this instead of
// hand-running docs/TRACKER.md's gh sequences or scanning the retired `.midnite/tasks/_INDEX.md`.
// Judgment stays with the agent — it writes the bodies and the Headlines sentence; this does the plumbing.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bar, mdTable, pct } from './lib/format.mjs';
import { CATEGORIES, PROJECT_ENV, REPO, createTracker } from './lib/forge-tracker.mjs';
import { biloToken } from './lib/pr-common.mjs';

export const HELP = `tracker — the phase tracker on the forge (docs/TRACKER.md)

  node scripts/skills/tracker.mjs <command> [args] [--json] [--dry-run] [--repo owner/name]

Read
  index [--state open|closed|all]        every phase: category, refined, themes done/total, WIP / TODO letters
  next                                   the next free phase number
  view <issue> | --phase N               a phase issue: themes, progress, Headlines
  candidates                             open themes of open phases: ready, claimed, in an open PR, or blocked

Write (each accepts --dry-run: prints the exact gh calls, runs none)
  file --phase-body F --theme F... [--category features|security|issues]
                                         create the phase issue + one sub-issue per theme file; each file's
                                         first "# " heading is its title ("Phase N — T" / "Phase N · Theme X — T")
  claim <issue>                          assign @me + label wip (the label is created when missing)
  tick <issue> --item "text"             tick the one open "- [ ]" task containing text (refuses 0 or 2+ matches)
  headlines <issue>|--phase N [--theme X] (--file F | --text "...")
                                         replace theme X's paragraph in "## Headlines" (no --theme: the section)
  refine-stamp <issue>|--phase N         swap refined-<N-1> for refined-N
  close <issue> [--comment "..."]        drop wip, then close
  board <issue> --status S [--project N] set the board card's Status (project: --project > the issue's board
                                         > $${PROJECT_ENV}; anything else is "ambiguous", never a guess)

Exit: 0 ok · 1 gh / forge failure · 2 usage. GH_TOKEN defaults to the bilo-io account's token.`;

const WRITES = new Set(['file', 'claim', 'tick', 'headlines', 'refine-stamp', 'close', 'board']);
const MULTI = new Set(['--theme-file']);

/** argv -> `{cmd, pos[], flags{}}`. `--theme` repeats under `file` (theme files) and is a letter elsewhere. */
export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const pos = [];
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = cmd === 'file' && a === '--theme' ? '--theme-file' : a;
    const takesValue = rest[i + 1] !== undefined && !rest[i + 1].startsWith('--') && !['--json', '--dry-run', '--help'].includes(a);
    const val = takesValue ? rest[++i] : true;
    if (MULTI.has(key)) (flags[key] ??= []).push(val);
    else flags[key] = val;
  }
  return { cmd, pos, flags };
}

const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
export const shellLine = (args) => ['gh', ...args].map(q).join(' ');

/** A markdown file's first `# ` heading (the issue title) — the body keeps it, as the house style does. */
export function titleOf(text) {
  return /^#\s+(.+?)\s*$/m.exec(text)?.[1] ?? null;
}

function indexTable(phases) {
  const icon = (p) => (p.state === 'closed' ? '✅' : p.wipThemes?.length ? '🔄' : '◻');
  return mdTable(
    ['#', 'Phase', 'Cat', 'State', 'Refined', 'Themes', 'Progress', '🔄 WIP', '◻ TODO'],
    phases.map((p) => {
      const done = p.state === 'closed' ? 1 : p.themesDone ?? 0;
      const total = p.state === 'closed' ? 1 : p.themes ?? 0;
      const per = p.state === 'closed' ? 100 : pct(done, total);
      return [`#${p.number}`, `${p.phase} · ${p.name}`, p.category ?? '—', icon(p), p.refined ? `x${p.refined}` : '—', p.state === 'closed' ? 'done' : `${done}/${total}`, `\`${bar(per)}\` ${per}%`, p.wipThemes?.join(' ') || '—', p.todoThemes?.join(' ') || '—'];
    }),
  );
}

function viewText(p) {
  const out = [`# ${p.title}  (#${p.number}, ${p.state}${p.refined ? `, refined x${p.refined}` : ''})`, p.url ?? '', ''];
  const pr = p.progress;
  out.push(`themes ${pr.themesDone}/${pr.themes} closed · tasks ${pr.tasksDone}/${pr.tasks} ticked · \`${bar(pct(pr.themesDone, pr.themes))}\``, '');
  out.push(mdTable(['Theme', 'Issue', 'State', 'Tasks', 'Claimed'], p.themes.map((t) => {
    const lines = String(t.body ?? '').split('\n');
    const done = lines.filter((l) => /^\s*[-*]\s+\[[xX]\]/.test(l)).length;
    const total = done + lines.filter((l) => /^\s*[-*]\s+\[ \]/.test(l)).length;
    return [`${t.theme ?? '?'} — ${t.name}`, `#${t.number}`, t.state, `${done}/${total}`, [t.wip ? 'wip' : '', ...t.assignees.map((a) => `@${a}`)].filter(Boolean).join(' ') || '—'];
  })));
  if (p.headlines.found) out.push('', '## Headlines', '', ...[p.headlines.lead, ...p.headlines.paragraphs.map((x) => x.text)].filter(Boolean).flatMap((x) => [x, '']));
  return out.join('\n');
}

async function issueArg(t, { pos, flags }) {
  if (flags['--phase'] != null && flags['--phase'] !== true) {
    const f = await t.findPhase(flags['--phase']);
    return f.ok ? { ok: true, n: f.number } : f;
  }
  const n = Number(pos[0]);
  return Number.isInteger(n) && n > 0 ? { ok: true, n } : { ok: false, kind: 'usage', message: 'needs an issue number (or --phase N)' };
}

/** Run one command; returns `{code, result}`. `deps` injects the gh runner / file reader for tests. */
export async function run(argv, { ghRun, readFile = (f) => readFileSync(f, 'utf8'), env, tmpFile, envProject } = {}) {
  const { cmd, pos, flags } = parseArgs(argv);
  if (!cmd || cmd === '--help' || cmd === 'help' || flags['--help']) return { code: 0, text: HELP };
  const dryRun = Boolean(flags['--dry-run']);
  const t = createTracker({ run: ghRun, repo: typeof flags['--repo'] === 'string' ? flags['--repo'] : REPO, env, dryRun, tmpFile });
  const usage = (message) => ({ ok: false, kind: 'usage', message });
  const need = (flag) => (typeof flags[flag] === 'string' ? flags[flag] : null);
  let r;
  switch (cmd) {
    case 'index':
      r = await t.index({ state: need('--state') ?? 'all' });
      break;
    case 'next':
      r = await t.next();
      break;
    case 'view': {
      const a = await issueArg(t, { pos, flags });
      r = a.ok ? await t.readPhase(a.n) : a;
      break;
    }
    case 'candidates':
      r = await t.candidates();
      break;
    case 'file': {
      const bodyFile = need('--phase-body');
      if (!bodyFile) { r = usage('file needs --phase-body F'); break; }
      const category = need('--category') ?? 'features';
      if (!CATEGORIES.includes(category)) { r = usage(`--category must be one of ${CATEGORIES.join('/')}`); break; }
      const body = readFile(bodyFile);
      const themes = (flags['--theme-file'] ?? []).map((f) => { const b = readFile(f); return { title: titleOf(b), body: b }; });
      r = await t.file({ title: titleOf(body), category, body, themes });
      break;
    }
    case 'claim':
    case 'close':
    case 'refine-stamp':
    case 'tick':
    case 'board':
    case 'headlines': {
      const a = await issueArg(t, { pos, flags });
      if (!a.ok) { r = a; break; }
      if (cmd === 'claim') r = await t.claim(a.n);
      else if (cmd === 'close') r = await t.close(a.n, { comment: need('--comment') ?? undefined });
      else if (cmd === 'refine-stamp') r = await t.refineStamp(a.n);
      else if (cmd === 'tick') r = need('--item') ? await t.tick(a.n, need('--item')) : usage('tick needs --item "text"');
      else if (cmd === 'board') r = need('--status') ? await t.board(a.n, need('--status'), { project: need('--project') ?? undefined, envProject }) : usage('board needs --status S');
      else {
        const text = need('--text') ?? (need('--file') ? readFile(need('--file')) : null);
        const theme = need('--theme');
        if (text == null) r = usage('headlines needs --text "..." or --file F');
        else if (theme && !/^[A-Z]$/.test(theme)) r = usage('--theme takes one capital letter');
        else r = await t.headlines(a.n, { theme, text });
      }
      break;
    }
    default:
      r = usage(`unknown command "${cmd}" (try --help)`);
  }
  const code = r.ok ? 0 : r.kind === 'usage' ? 2 : 1;
  const calls = WRITES.has(cmd) ? t.calls : undefined;
  if (flags['--json']) return { code, text: JSON.stringify({ ...r, ...(calls ? { calls: calls.map(shellLine) } : {}) }, null, 2) };
  if (!r.ok) return { code, text: `${r.kind}: ${r.message}${r.kind === 'usage' ? '\n\n' + HELP.split('\n').slice(0, 3).join('\n') : ''}` };
  if (dryRun && calls) return { code, text: ['# dry run — nothing was written', ...calls.map(shellLine)].join('\n') };
  return { code, text: render(cmd, r) };
}

function render(cmd, r) {
  switch (cmd) {
    case 'index':
      return indexTable(r.phases);
    case 'next':
      return String(r.next);
    case 'view':
      return viewText(r.phase);
    case 'candidates': {
      const rows = r.candidates.sort((a, b) => b.available - a.available || a.phase - b.phase || a.theme.localeCompare(b.theme));
      return [mdTable(['', 'Phase', 'Theme', 'Issue', 'Cat', 'Why'], rows.map((c) => [c.available ? '🟢' : '⏳', String(c.phase), `${c.theme} — ${c.name}`, `#${c.number}`, c.category ?? '—', c.why])), ...r.notes.map((n) => `note: ${n}`)].join('\n');
    }
    case 'file':
      return `filed phase #${r.phase}; themes ${r.themes.map((x) => `#${x.number}`).join(' ') || '—'}`;
    case 'tick':
      return r.already ? `#${r.number}: already ticked` : `#${r.number}: ticked line ${r.line}`;
    case 'headlines':
      return `#${r.number}: Headlines ${r.theme ? `Theme ${r.theme} ${r.replaced ? 'replaced' : 'added'}` : 'section replaced'}`;
    case 'refine-stamp':
      return `#${r.number}: ${r.label}`;
    case 'board':
      return `#${r.number}: Status → ${r.status} (project ${r.project}, from ${r.projectSource})`;
    default:
      return `#${r.number}: ${cmd} ok`;
  }
}


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env.GH_TOKEN ? undefined : { GH_TOKEN: biloToken() || undefined };
  run(process.argv.slice(2), { env }).then(
    ({ code, text }) => { process.stdout.write(`${text}\n`); process.exitCode = code; },
    (e) => { process.stderr.write(`${e.stack ?? e}\n`); process.exitCode = 1; },
  );
}
