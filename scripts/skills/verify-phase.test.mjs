import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { capLine, contextTokens, machineLine, nextCap, parseCpu, parseRam, rotationState, surplus } from './orchestrate-cap.mjs';
import { classifyLog, classifyText, summarise } from './test-classify.mjs';
import { completePhase, main, oldestIncomplete, partitionItems, phaseText, planGate, tickItems, tickPhase, verify } from './verify-phase.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const DOC = `## Headlines

### Theme A — x
- [x] **9.A.1** done thing
- [ ] **9.A.2** build the parser
- [ ] **9.A.3** **Open, for a human:** eyeball the dialog
- [ ] **9.A.4** ⏳ deferred to later
`;

/** A fake forge-tracker: phase 9 (#90) with themes A (#91, open) and B (#92, closed); records writes. */
function fakeTracker(themeA = DOC.split('\n').slice(3).join('\n')) {
  const writes = [];
  const phase = {
    number: 90, phase: 9, name: 'Newer', category: 'features', url: 'u', state: 'open',
    themes: [
      { number: 91, theme: 'A', name: 'x', state: 'open', body: themeA },
      { number: 92, theme: 'B', name: 'y', state: 'closed', body: '- [x] **9.B.1** shipped' },
    ],
  };
  const phases = [{ number: 90, phase: 9, state: 'open' }, { number: 80, phase: 8, state: 'open' }, { number: 70, phase: 7, state: 'closed' }];
  return {
    writes,
    phase,
    calls: [],
    listPhases: async () => ({ ok: true, phases }),
    findPhase: async (n) => (Number(n) === 9 ? { ok: true, number: 90 } : { ok: false, kind: 'not-found', message: `no phase ${n}` }),
    readPhase: async (n) => (n === 90 ? { ok: true, phase } : { ok: true, phase: { ...phase, number: n, phase: 8, themes: [] } }),
    editBody: async (n, body) => (writes.push(['edit', n, body]), { ok: true }),
    close: async (n, o) => (writes.push(['close', n, o.comment]), { ok: true }),
  };
}

describe('cap state machine', () => {
  it('parses top and memory_pressure lines', () => {
    expect(parseCpu('CPU usage: 5.2% user, 8.1% sys, 86.7% idle')).toBe(13.3);
    expect(parseRam('System-wide memory free percentage: 42%')).toBe(58);
    expect(parseCpu('nonsense')).toBeNull();
  });
  it('lowers above 80 and never below 2', () => {
    expect(nextCap({ cap: 3, cpu: 85, ram: 10 })).toMatchObject({ cap: 2, action: 'lower' });
    expect(nextCap({ cap: 2, cpu: 10, ram: 95 })).toMatchObject({ cap: 2, action: 'keep' });
  });
  it('capacity is the max of CPU and RAM', () => {
    expect(nextCap({ cap: 4, cpu: 10, ram: 81 }).cap).toBe(3);
  });
  it('raises only after two low checks in a row, never above 6', () => {
    const a = nextCap({ cap: 3, cpu: 30, ram: 40 });
    expect(a).toMatchObject({ cap: 3, lowStreak: 1, action: 'hold-low' });
    expect(nextCap({ cap: 3, lowStreak: a.lowStreak, cpu: 30, ram: 40 })).toMatchObject({ cap: 4, lowStreak: 0, action: 'raise' });
    expect(nextCap({ cap: 6, lowStreak: 5, cpu: 1, ram: 1 }).cap).toBe(6);
  });
  it('the middle band keeps the cap and resets the streak', () => {
    expect(nextCap({ cap: 3, lowStreak: 1, cpu: 70, ram: 20 })).toMatchObject({ cap: 3, lowStreak: 0, action: 'keep' });
  });
  it('surplus agents and the cap line', () => {
    expect(surplus(5, 3)).toBe(2);
    expect(surplus(1, 3)).toBe(0);
    expect(capLine(3, 2)).toBe('🤖 Subagent CAP: 3 (2 running)');
    expect(machineLine({ cpu: 50, ram: 20, cap: 3, running: 1 })).toContain('█████░░░░░ 50%');
  });
  it('reads context tokens from a transcript and flags rotation', () => {
    const jl = [JSON.stringify({ message: { usage: { input_tokens: 10, cache_read_input_tokens: 100_000 } } }), 'garbage', JSON.stringify({ message: { usage: { input_tokens: 5, cache_read_input_tokens: 500_000, cache_creation_input_tokens: 95 } } })].join('\n');
    expect(contextTokens(jl)).toBe(500_100);
    expect(rotationState(500_100).state).toBe('watch');
    expect(rotationState(700_000).state).toBe('rotate');
    expect(rotationState(null).state).toBe('unknown');
  });
});

describe('verify-phase', () => {
  it('partitions automated, human and excluded items', () => {
    const items = partitionItems(DOC);
    expect(items.map((i) => [i.id, i.kind, i.done])).toEqual([
      ['9.A.1', 'automated', true],
      ['9.A.2', 'automated', false],
      ['9.A.3', 'human', false],
      ['9.A.4', 'excluded', false],
    ]);
  });
  it('ticks by id and never ticks deferred or human items under "all"', () => {
    expect(tickItems(DOC, ['9.A.2']).text).toContain('- [x] **9.A.2**');
    const all = tickItems(DOC, [], { allAutomated: true });
    expect(all.ticked).toEqual(['9.A.2']);
    expect(all.text).toContain('- [ ] **9.A.3**');
  });
  it('finds the oldest open phase', () => {
    expect(oldestIncomplete([{ phase: 9, state: 'open' }, { phase: 8, state: 'open' }, { phase: 7, state: 'closed' }]).phase).toBe(8);
    expect(oldestIncomplete([])).toBeNull();
  });
  it('builds the checklist from the theme sub-issues', () => {
    const t = fakeTracker();
    const items = partitionItems(phaseText(t.phase.themes));
    expect(items.map((i) => [i.theme, i.id])).toEqual([['A', '9.A.1'], ['A', '9.A.2'], ['A', '9.A.3'], ['A', '9.A.4'], ['B', '9.B.1']]);
  });
  it('never plans the full gate by default; --full opts in', async () => {
    const gate = ['make', 'check'];
    expect(planGate({ gate }).find((s) => s.name === 'full gate').run).toBe(false);
    expect(planGate({ full: true, gate }).find((s) => s.name === 'full gate')).toMatchObject({ run: true, cmd: gate });
    expect(planGate({ full: true, gate: null }).find((s) => s.name === 'full gate').run).toBe(false); // no gate declared: listed, never run
    const ran = [];
    const r = await verify({ tracker: fakeTracker(), phase: 9, exec: (cmd) => (ran.push(cmd.join(' ')), { code: 0, out: 'ok' }) });
    expect(ran).toEqual([]);
    expect(r).toMatchObject({ ok: true, phase: 9, issue: 90, counts: { done: 2, open: 2, total: 4 } });
    expect(r.openHuman).toHaveLength(1);
    expect(r.openAutomated).toHaveLength(1);
    await verify({ tracker: fakeTracker(), phase: 9, full: true, exec: (cmd) => (ran.push(cmd.join(' ')), { code: 0, out: '' }) });
    expect(ran).toContain('moon run :typecheck :lint :test');
    expect((await verify({ tracker: fakeTracker(), phase: 3 })).ok).toBe(false);
  });
  it('ticks inside the owning theme sub-issue only', async () => {
    const t = fakeTracker();
    const r = await tickPhase(t, t.phase, ['9.A.2']);
    expect(r.ticked).toEqual(['9.A.2 (#91)']);
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0][2]).toContain('- [x] **9.A.2**');
  });
  it('--complete refuses without --confirm or with open items, then closes themes and the phase', async () => {
    const lines = [];
    const out = (s) => lines.push(s);
    expect(await main(['--phase', '9', '--complete'], { out, tracker: fakeTracker() })).toBe(2);
    expect(lines.pop()).toContain('--confirm');
    const open = fakeTracker();
    expect(await main(['--phase', '9', '--complete', '--confirm'], { out, tracker: open })).toBe(3);
    expect(lines.pop()).toContain('still open');
    expect(open.writes).toEqual([]);
    const done = fakeTracker('- [x] **9.A.1** a\n- [ ] **9.A.4** ⏳ deferred: later');
    expect((await completePhase(done, done.phase)).ok).toBe(true);
    expect(done.writes).toEqual([['close', 91, 'Verified: 2/2 items.'], ['close', 90, 'Verified: 2/2 items.']]);
  });
});

describe('test-classify', () => {
  it.each([
    ['eslint: no-restricted-imports: app may not import', 'boundary'],
    ['src/a.ts(1,2): error TS2322: nope', 'ts'],
    ["fatal: Unable to create '/r/.git/index.lock': File exists", 'index-lock'],
    ['ERR_PNPM_FETCH_401 GET https://npm.pkg.github.com', 'auth'],
    ['Error: Test timed out in 5000ms', 'timeout'],
    ['The job was not started because an Actions budget is preventing further use', 'billing'],
    ['AssertionError: expected 1 to be 2', 'assertion'],
  ])('%s -> %s', (text, kind) => {
    expect(classifyText(text).kind).toBe(kind);
  });
  it('unknown text goes to the fallback with no daemon', async () => {
    const items = await classifyLog('FAIL weird.test.ts\nsomething unexplained', { noLlm: true });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'other', source: 'fallback' });
  });
  it('uses the model for unplaced blocks when one answers, and only accepts a known label', async () => {
    const fetch = async (url) =>
      url.endsWith('/api/tags')
        ? { ok: true, json: async () => ({ models: [{ name: 'gemma4:e2b' }, { name: 'ministral-3:3b' }] }) }
        : { ok: true, json: async () => ({ response: 'timeout', message: { content: 'timeout' } }) };
    const items = await classifyLog('FAIL weird.test.ts\nsomething unexplained', { fetch });
    expect(['timeout', 'other']).toContain(items[0].kind);
  });
  it('flags a rerun only when every failure is flaky', () => {
    expect(summarise([{ kind: 'timeout', flaky: true }, { kind: 'index-lock', flaky: true }]).rerunWorthy).toBe(true);
    expect(summarise([{ kind: 'timeout', flaky: true }, { kind: 'ts', flaky: false }]).rerunWorthy).toBe(false);
  });
});

describe('worktree-lifecycle.sh', () => {
  it('refuses a dirty remove without --force, ignores SCRATCHPAD.md, and never removes the primary', () => {
    const base = mkdtempSync(join(tmpdir(), 'wt-'));
    const primary = join(base, 'primary');
    const sh = (...a) => execFileSync('bash', [join(here, 'worktree-lifecycle.sh'), ...a], { encoding: 'utf8', env: { ...process.env, MIDNITE_WT_ROOT: primary }, stdio: 'pipe' });
    const git = (...a) => execFileSync('git', ['-C', primary, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { stdio: 'pipe' });
    try {
      mkdirSync(primary);
      git('init', '-q', '-b', 'main');
      writeFileSync(join(primary, 'a.txt'), 'a');
      git('add', '-A');
      git('commit', '-q', '-m', 'init');
      const wt = join(primary, '.worktrees', 'w1');
      git('worktree', 'add', '-q', wt, '-b', 'feature/w1', 'main');
      writeFileSync(join(wt, 'SCRATCHPAD.md'), 'notes');
      expect(sh('check', 'w1').trim()).toBe('clean');
      writeFileSync(join(wt, 'dirty.txt'), 'x');
      expect(() => sh('remove', 'w1')).toThrow(/uncommitted changes/);
      expect(() => sh('remove', primary)).toThrow(/primary/);
      expect(sh('remove', 'w1', '--force', '--delete-branch')).toContain('removed');
      expect(execFileSync('git', ['-C', primary, 'branch', '--list', 'feature/w1'], { encoding: 'utf8' }).trim()).toBe('');
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
