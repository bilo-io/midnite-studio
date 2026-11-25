import { describe, expect, it } from 'vitest';

import {
  blockerRefs, claimedByPrs, countTasks, createTracker, nextPhaseNumber, parseHeadlines, parseTitle, pickCandidates,
  refinedCount, replaceHeadlines, replaceThemeParagraph, tickTask, toIssue,
} from './lib/forge-tracker.mjs';
import { parseArgs, run, shellLine, titleOf } from './tracker.mjs';

const BODY = `# Phase 9 — Thing

> **Builds on:** Phase 8.

## Headlines

Lead paragraph.

**Theme A — Parser.** ✅ Landed.

**Theme C — Wiring.** Planned.

## Deliverables

- [x] build the parser
- [ ] wire the dialog
- [ ] wire the menu
- [ ] ⏳ deferred: polish
`;

/** A fake gh: `routes` maps a predicate over argv to a response (string, object or Error). Records every call. */
function fakeGh(routes) {
  const calls = [];
  const runner = async (args) => {
    calls.push(args);
    for (const [match, res] of routes) {
      if (match(args)) {
        const v = typeof res === 'function' ? res(args) : res;
        if (v instanceof Error) throw v;
        return typeof v === 'string' ? v : JSON.stringify(v);
      }
    }
    throw Object.assign(new Error('unrouted'), { stderr: `unrouted: ${args.join(' ')}` });
  };
  return { calls, run: runner };
}
const starts = (...words) => (args) => words.every((w, i) => args[i] === w);

const PHASES = [
  { number: 20, title: 'Phase 9 — Thing', state: 'OPEN', labels: [{ name: 'phase' }, { name: 'features' }, { name: 'refined-1' }], assignees: [], url: 'u20', body: BODY },
  { number: 10, title: 'Phase 8 — Older', state: 'CLOSED', labels: [{ name: 'phase' }, { name: 'issues' }], assignees: [] },
  { number: 5, title: 'Issues phase 1 — legacy', state: 'OPEN', labels: [{ name: 'phase' }], assignees: [] },
];
const SUBS = [[
  { number: 21, id: 9021, title: 'Phase 9 · Theme A — Parser', state: 'closed', labels: [{ name: 'theme' }], assignees: [], body: '- [x] a' },
  { number: 22, id: 9022, title: 'Phase 9 · Theme B — Dialog', state: 'open', labels: [{ name: 'theme' }, { name: 'wip' }], assignees: [{ login: 'bilo-io' }], body: '- [ ] b\n- [x] c' },
  { number: 23, id: 9023, title: 'Phase 9 · Theme C — Wiring', state: 'open', labels: [{ name: 'theme' }], assignees: [], body: 'Blocked by #22\n- [ ] d' },
  { number: 24, id: 9024, title: 'Phase 9 · Theme D — Menu', state: 'open', labels: [{ name: 'theme' }], assignees: [], body: '- [ ] e' },
  { number: 25, id: 9025, title: 'Phase 9 · Theme E — Docs', state: 'open', labels: [{ name: 'theme' }], assignees: [], body: '- [ ] f' },
]];

const baseRoutes = () => [
  [starts('issue', 'list'), (a) => (a.includes('phase') ? PHASES : [{ number: 22 }, { number: 23 }, { number: 24 }, { number: 25 }, { number: 20 }])],
  [(a) => a[0] === 'api' && /issues\/20\/sub_issues/.test(a.join(' ')), SUBS],
  [(a) => a[0] === 'api' && /sub_issues\?/.test(a.join(' ')), [[]]],
  [starts('issue', 'view', '20'), (a) => (a.includes('projectItems') ? { projectItems: [] } : PHASES[0])],
  [starts('pr', 'list'), [{ number: 99, body: 'Closes #24', closingIssuesReferences: [] }]],
];

describe('pure: titles, labels, tasks', () => {
  it('parses phase and theme titles', () => {
    expect(parseTitle('Phase 154 — Custom agents')).toEqual({ phase: 154, theme: null, name: 'Custom agents' });
    expect(parseTitle('Phase 154 · Theme A — Shared contract')).toEqual({ phase: 154, theme: 'A', name: 'Shared contract' });
    expect(parseTitle('Issues phase 1 — x').phase).toBeNull();
  });
  it('next phase number ignores non-tracker titles', () => {
    expect(nextPhaseNumber(PHASES)).toBe(10);
    expect(nextPhaseNumber([])).toBe(1);
  });
  it('reads refined-N, category, wip and assignees', () => {
    expect(refinedCount(['phase', 'refined-1', 'refined-3'])).toBe(3);
    expect(refinedCount([])).toBe(0);
    const t = toIssue(SUBS[0][1]);
    expect(t).toMatchObject({ theme: 'B', wip: true, assignees: ['bilo-io'], state: 'open', id: 9022 });
    expect(toIssue(PHASES[0])).toMatchObject({ category: 'features', refined: 1, state: 'open' });
  });
  it('counts tasks, excluding deferred', () => expect(countTasks(BODY)).toEqual({ done: 1, open: 2, excluded: 1, total: 3 }));
  it('ticks exactly one match, refuses none or several', () => {
    const r = tickTask(BODY, 'DIALOG');
    expect(r).toMatchObject({ ok: true, ticked: 1 });
    expect(r.body).toContain('- [x] wire the dialog');
    expect(tickTask(BODY, 'wire')).toMatchObject({ ok: false, kind: 'ambiguous' });
    expect(tickTask(BODY, 'nope')).toMatchObject({ ok: false, kind: 'not-found' });
    expect(tickTask(BODY, 'parser')).toMatchObject({ ok: true, already: true, ticked: 0 });
    expect(tickTask(BODY, '  ').kind).toBe('usage');
  });
});

describe('pure: Headlines', () => {
  it('parses lead and theme paragraphs, stopping at the next ## heading', () => {
    const h = parseHeadlines(BODY);
    expect(h.lead).toBe('Lead paragraph.');
    expect(h.paragraphs.map((p) => p.theme)).toEqual(['A', 'C']);
    expect(parseHeadlines('no section').found).toBe(false);
  });
  it('replaces one theme paragraph and leaves the rest of the body alone', () => {
    const r = replaceThemeParagraph(BODY, 'C', '**Theme C — Wiring.** ✅ Landed in #30.');
    expect(r).toMatchObject({ ok: true, replaced: true });
    expect(r.body).toContain('✅ Landed in #30.');
    expect(r.body).not.toContain('Planned.');
    expect(r.body).toContain('## Deliverables\n\n- [x] build the parser');
    expect(r.body).toContain('> **Builds on:** Phase 8.');
  });
  it('inserts a missing theme in letter order', () => {
    const r = replaceThemeParagraph(BODY, 'B', '**Theme B — Dialog.** WIP.');
    expect(r.replaced).toBe(false);
    const h = parseHeadlines(r.body);
    expect(h.paragraphs.map((p) => p.theme)).toEqual(['A', 'B', 'C']);
    expect(replaceThemeParagraph('nothing', 'A', 'x').ok).toBe(false);
  });
  it('replaces or appends the whole section', () => {
    expect(replaceHeadlines(BODY, '## Headlines\n\nAll new.')).toMatch(/## Headlines\n\nAll new.\n\n## Deliverables/);
    expect(replaceHeadlines('# T\n', 'x')).toBe('# T\n\n## Headlines\n\nx\n');
  });
});

describe('pure: candidates', () => {
  it('finds blockers and PR claims', () => {
    expect(blockerRefs('Blocked by #12\nDepends on: #13, #14 and #15\nafter #99')).toEqual([12, 13, 14, 15]);
    const m = claimedByPrs([{ number: 7, body: 'Fixes #3, closes #4', closingIssuesReferences: [{ number: 5 }] }]);
    expect([...m.keys()].sort()).toEqual([3, 4, 5]);
  });
  it('classifies open themes', () => {
    const phases = [{ ...toIssue(PHASES[0]), themes: SUBS[0].map(toIssue) }];
    const rows = pickCandidates({ phases, prs: [{ number: 99, body: 'Closes #24' }], openNumbers: new Set([22, 23, 24, 25]) });
    expect(Object.fromEntries(rows.map((r) => [r.theme, r.why]))).toEqual({ B: 'claimed', C: 'blocked by #22', D: 'in PR #99', E: 'ready' });
    expect(rows.filter((r) => r.available).map((r) => r.number)).toEqual([25]);
  });
});

describe('tracker over a mocked gh', () => {
  it('index fetches sub-issues only for open phases', async () => {
    const gh = fakeGh(baseRoutes());
    const r = await createTracker({ run: gh.run }).index();
    expect(r.ok).toBe(true);
    const p9 = r.phases.find((p) => p.phase === 9);
    expect(p9).toMatchObject({ themesDone: 1, themes: 5, wipThemes: ['B'], todoThemes: ['C', 'D', 'E'] });
    expect(r.phases.find((p) => p.phase === 8).themes).toBeNull();
    expect(gh.calls.filter((c) => c[0] === 'api')).toHaveLength(1);
  });
  it('readPhase sums progress over the theme bodies', async () => {
    const r = await createTracker({ run: fakeGh(baseRoutes()).run }).readPhase(20);
    expect(r.phase.progress).toEqual({ themesDone: 1, themes: 5, tasksDone: 2, tasks: 6 });
    expect(r.phase.headlines.paragraphs).toHaveLength(2);
  });
  it('reads fail as envelopes, never throws', async () => {
    const gh = fakeGh([[() => true, Object.assign(new Error('x'), { stderr: 'gh auth login' })]]);
    expect(await createTracker({ run: gh.run }).listPhases()).toMatchObject({ ok: false, kind: 'auth' });
  });
  it('file creates the phase, each theme, and links it by database id', async () => {
    let n = 40;
    const gh = fakeGh([
      [starts('issue', 'create'), () => `https://github.com/o/r/issues/${++n}\n`],
      [(a) => a[0] === 'api' && /issues\/4[12]$/.test(a[1]), (a) => ({ id: 1000 + Number(a[1].split('/').pop()) })],
      [(a) => a.includes('POST'), ''],
    ]);
    const t = createTracker({ run: gh.run, repo: 'o/r', tmpFile: (_, name) => `/tmp/${name}` });
    const r = await t.file({ title: 'Phase 9 — Thing', category: 'features', body: 'b', themes: [{ title: 'Phase 9 · Theme A — Parser', body: 't' }] });
    expect(r).toEqual({ ok: true, phase: 41, themes: [{ number: 42, title: 'Phase 9 · Theme A — Parser' }] });
    expect(gh.calls[0]).toEqual(['issue', 'create', '--repo', 'o/r', '--title', 'Phase 9 — Thing', '--label', 'phase,features', '--body-file', '/tmp/phase.md']);
    expect(gh.calls.at(-1)).toEqual(['api', 'repos/o/r/issues/41/sub_issues', '-X', 'POST', '-F', 'sub_issue_id=1042']);
  });
  it('file validates titles and category before writing', async () => {
    const gh = fakeGh([]);
    const t = createTracker({ run: gh.run });
    expect((await t.file({ title: 'Thing', category: 'features', body: '' })).kind).toBe('usage');
    expect((await t.file({ title: 'Phase 9 — T', category: 'bugs', body: '' })).kind).toBe('usage');
    expect(gh.calls).toEqual([]);
  });
  it('dry-run records the writes and runs none', async () => {
    const gh = fakeGh([]);
    const t = createTracker({ run: gh.run, dryRun: true, repo: 'o/r', tmpFile: (_, name) => `/tmp/${name}` });
    const r = await t.file({ title: 'Phase 9 — T', category: 'issues', body: 'b', themes: [{ title: 'Phase 9 · Theme A — X', body: 't' }] });
    expect(r.ok).toBe(true);
    expect(gh.calls).toEqual([]);
    expect(t.calls.map(shellLine)).toEqual([
      'gh issue create --repo o/r --title \'Phase 9 — T\' --label phase,issues --body-file /tmp/phase.md',
      'gh issue create --repo o/r --title \'Phase 9 · Theme A — X\' --label theme --body-file /tmp/theme-1.md',
      "gh api 'repos/o/r/issues/<phase>/sub_issues' -X POST -F 'sub_issue_id=<id of <theme 1>>'",
    ]);
  });
  it('claim creates wip when missing (tolerating "already exists") then assigns', async () => {
    const gh = fakeGh([
      [starts('label', 'create'), Object.assign(new Error('x'), { stderr: 'label with name "wip" already exists' })],
      [starts('issue', 'edit'), ''],
    ]);
    expect((await createTracker({ run: gh.run }).claim(22)).ok).toBe(true);
    expect(gh.calls[1]).toEqual(expect.arrayContaining(['--add-assignee', '@me', '--add-label', 'wip']));
  });
  it('refine-stamp swaps the old label for the next one', async () => {
    const gh = fakeGh([[starts('issue', 'view'), PHASES[0]], [() => true, '']]);
    const r = await createTracker({ run: gh.run }).refineStamp(20);
    expect(r).toMatchObject({ ok: true, refined: 2, label: 'refined-2' });
    expect(gh.calls.at(-1)).toEqual(expect.arrayContaining(['--remove-label', 'refined-1', '--add-label', 'refined-2']));
  });
  it('close drops wip first', async () => {
    const gh = fakeGh([[starts('issue', 'view'), SUBS[0][1]], [() => true, '']]);
    expect((await createTracker({ run: gh.run }).close(22, { comment: 'Verified' })).ok).toBe(true);
    expect(gh.calls[1]).toEqual(expect.arrayContaining(['--remove-label', 'wip']));
    expect(gh.calls[2]).toEqual(expect.arrayContaining(['close', '22', '--comment', 'Verified']));
  });
  it('tick edits the body through a body file', async () => {
    let written = '';
    const gh = fakeGh([[starts('issue', 'view'), PHASES[0]], [starts('issue', 'edit'), '']]);
    const t = createTracker({ run: gh.run, tmpFile: (text) => ((written = text), '/tmp/b.md') });
    expect(await t.tick(20, 'menu')).toMatchObject({ ok: true, number: 20 });
    expect(written).toContain('- [x] wire the menu');
    expect((await t.tick(20, 'wire')).kind).toBe('ambiguous');
  });

  describe('board', () => {
    const fields = { fields: [{ id: 'F1', name: 'Status', options: [{ id: 'O1', name: 'Todo' }, { id: 'O2', name: 'In Progress' }] }] };
    const routes = (items) => [
      [(a) => a.includes('projectItems'), { projectItems: items }],
      [starts('project', 'list'), { projects: [{ number: 6, title: 'midnite apps' }] }],
      [starts('project', 'view'), { id: 'PVT_6' }],
      [starts('project', 'field-list'), fields],
      [starts('project', 'item-add'), { id: 'ITEM_1' }],
      [starts('project', 'item-edit'), ''],
    ];
    it('resolves the project from the issue card and sets Status case-insensitively', async () => {
      const gh = fakeGh(routes([{ title: 'midnite apps' }]));
      const r = await createTracker({ run: gh.run }).board(22, 'in progress', { envProject: '' });
      expect(r).toMatchObject({ ok: true, project: 6, projectSource: 'issue', status: 'In Progress' });
      expect(gh.calls.at(-1)).toEqual(['project', 'item-edit', '--id', 'ITEM_1', '--project-id', 'PVT_6', '--field-id', 'F1', '--single-select-option-id', 'O2']);
    });
    it('is ambiguous with no board, or two, unless --project or the env names one', async () => {
      expect((await createTracker({ run: fakeGh(routes([])).run }).board(22, 'Todo', { envProject: '' })).kind).toBe('ambiguous');
      expect((await createTracker({ run: fakeGh(routes([{ title: 'a' }, { title: 'b' }])).run }).board(22, 'Todo', { envProject: '' })).kind).toBe('ambiguous');
      expect(await createTracker({ run: fakeGh(routes([])).run }).board(22, 'Todo', { envProject: '6' })).toMatchObject({ ok: true, projectSource: 'env' });
      expect(await createTracker({ run: fakeGh(routes([])).run }).board(22, 'Todo', { project: 6 })).toMatchObject({ ok: true, projectSource: 'flag' });
    });
    it('rejects an unknown Status', async () => {
      expect((await createTracker({ run: fakeGh(routes([])).run }).board(22, 'Shipped', { project: 6 })).kind).toBe('usage');
    });
  });
});

describe('tracker CLI', () => {
  it('parses args; --theme repeats under file and is a letter elsewhere', () => {
    expect(parseArgs(['file', '--phase-body', 'p.md', '--theme', 'a.md', '--theme', 'b.md', '--dry-run']).flags).toEqual({ '--phase-body': 'p.md', '--theme-file': ['a.md', 'b.md'], '--dry-run': true });
    expect(parseArgs(['headlines', '20', '--theme', 'C', '--text', 'x'])).toEqual({ cmd: 'headlines', pos: ['20'], flags: { '--theme': 'C', '--text': 'x' } });
    expect(titleOf('intro\n# Phase 9 — T\nbody')).toBe('Phase 9 — T');
  });
  it('--help and usage errors exit 0 / 2', async () => {
    expect((await run(['--help'])).text).toContain('refine-stamp');
    expect((await run(['bogus'], { ghRun: fakeGh([]).run })).code).toBe(2);
    expect((await run(['tick', '20'], { ghRun: fakeGh([]).run })).code).toBe(2);
    expect((await run(['headlines', '20', '--theme', 'cc', '--text', 'x'], { ghRun: fakeGh([]).run })).code).toBe(2);
  });
  it('next, index and candidates render; --json is machine-readable', async () => {
    const ghRun = fakeGh(baseRoutes()).run;
    expect((await run(['next'], { ghRun })).text).toBe('10');
    expect((await run(['index'], { ghRun })).text).toContain('| #20 | 9 · Thing | features | 🔄 | x1 | 1/5 |');
    expect(JSON.parse((await run(['index', '--category', 'issues', '--json'], { ghRun })).text).phases.map((p) => p.phase)).toEqual([8]);
    const c = JSON.parse((await run(['candidates', '--json'], { ghRun })).text);
    expect(c.candidates.filter((x) => x.available).map((x) => x.theme)).toEqual(['E']);
  });
  it('view --phase N resolves the phase number', async () => {
    const r = await run(['view', '--phase', '9'], { ghRun: fakeGh(baseRoutes()).run });
    expect(r.code).toBe(0);
    expect(r.text).toContain('themes 1/5 closed');
  });
  it('a write with --dry-run prints the exact gh lines', async () => {
    const gh = fakeGh(baseRoutes());
    const r = await run(['headlines', '--phase', '9', '--theme', 'C', '--text', '**Theme C — Wiring.** ✅', '--dry-run'], { ghRun: gh.run, tmpFile: () => '/tmp/x.md' });
    expect(r.text).toBe('# dry run — nothing was written\ngh issue edit 20 --repo bilo-io/midnite-studio --body-file /tmp/x.md');
    expect(gh.calls.some((c) => c.includes('edit'))).toBe(false);
  });
  it('link resolves the child database id and posts it', async () => {
    const gh = fakeGh([[(a) => a[0] === 'api' && a[1].endsWith('/issues/31'), { id: 777 }], [(a) => a.includes('POST'), '']]);
    expect((await run(['link', '30', '31'], { ghRun: gh.run })).text).toBe('#31: linked under #30');
    expect(gh.calls.at(-1)).toEqual(['api', 'repos/bilo-io/midnite-studio/issues/30/sub_issues', '-X', 'POST', '-F', 'sub_issue_id=777']);
    expect((await run(['link', '30'], { ghRun: gh.run })).code).toBe(2);
  });
  it('file reads the bodies and titles from the files', async () => {
    const files = { 'p.md': '# Phase 9 — Thing\n\nbody', 'a.md': '# Phase 9 · Theme A — Parser\n- [ ] x' };
    const r = await run(['file', '--phase-body', 'p.md', '--theme', 'a.md', '--category', 'security', '--dry-run', '--json'], { ghRun: fakeGh([]).run, readFile: (f) => files[f], tmpFile: (_, n) => `/tmp/${n}` });
    const j = JSON.parse(r.text);
    expect(j.calls[0]).toContain("--title 'Phase 9 — Thing' --label phase,security");
    expect(j.calls[1]).toContain("'Phase 9 · Theme A — Parser' --label theme");
  });
});
