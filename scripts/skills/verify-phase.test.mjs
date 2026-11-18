import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { capLine, contextTokens, machineLine, nextCap, parseCpu, parseRam, rotationState, surplus } from './orchestrate-cap.mjs';
import { classifyLog, classifyText, summarise } from './test-classify.mjs';
import { findPhase, markIndexDone, oldestIncomplete, partitionItems, planGate, tickItems, verify } from './verify-phase.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const DOC = `## Headlines

### Theme A — x
- [x] **9.A.1** done thing
- [ ] **9.A.2** build the parser
- [ ] **9.A.3** **Open, for a human:** eyeball the dialog
- [ ] **9.A.4** ⏳ deferred to later
`;

const INDEX = `# Idx

| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [9 · Newer](phases/phase-9.md) | 🔄 WIP | — | 1/3 | \`███░░░░░░░\` | 33% | A | — |
| [8 · Older](phases/phase-8.md) | ◻ TODO | — | 0/1 | \`░░░░░░░░░░\` | 0% | — | A |
| [7 · Done](phases/phase-7.md) | ✅ DONE | — | 1/1 | \`██████████\` | 100% | — | — |
`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'verify-'));
  mkdirSync(join(root, '.midnite/tasks/FEATURES/phases'), { recursive: true });
  writeFileSync(join(root, '.midnite/tasks/FEATURES/_INDEX.md'), INDEX);
  writeFileSync(join(root, '.midnite/tasks/FEATURES/phases/phase-9.md'), DOC);
  writeFileSync(join(root, '.midnite/tasks/FEATURES/phases/phase-8.md'), '### Theme A\n- [ ] **8.A.1** x\n');
  return root;
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
  it('finds the oldest incomplete phase', () => {
    const root = fixture();
    try {
      expect(oldestIncomplete(root).phase).toBe(8);
      expect(findPhase(root, 9).category).toBe('FEATURES');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('never plans the full gate by default; --full opts in', () => {
    expect(planGate().find((s) => s.name === 'full gate').run).toBe(false);
    expect(planGate({ full: true }).find((s) => s.name === 'full gate').run).toBe(true);
    const ran = [];
    const root = fixture();
    try {
      const r = verify({ root, phase: 9, exec: (cmd) => (ran.push(cmd.join(' ')), { code: 0, out: 'ok' }) });
      expect(ran).toEqual([]);
      expect(r.openHuman).toHaveLength(1);
      expect(r.openAutomated).toHaveLength(1);
      ran.length = 0;
      verify({ root, phase: 9, full: true, exec: (cmd) => (ran.push(cmd.join(' ')), { code: 0, out: '' }) });
      expect(ran).toContain('moon run :typecheck :lint :test');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('--complete refuses without --confirm or with open items, then marks the row DONE', () => {
    const root = fixture();
    const cli = (...a) => { try { return execFileSync('node', [join(here, 'verify-phase.mjs'), '--root', root, ...a], { encoding: 'utf8' }); } catch (e) { return `${e.stdout}`; } };
    try {
      expect(cli('--phase', '9', '--complete')).toContain('--confirm');
      expect(cli('--phase', '9', '--complete', '--confirm')).toContain('still open');
      writeFileSync(join(root, '.midnite/tasks/FEATURES/phases/phase-8.md'), '- [x] **8.A.1** x\n');
      writeFileSync(join(root, '.midnite/tasks/done.md'), '# done\n');
      expect(cli('--phase', '8', '--complete', '--confirm')).toContain('marked DONE');
      const idx = readFileSync(join(root, '.midnite/tasks/FEATURES/_INDEX.md'), 'utf8');
      expect(idx).toMatch(/\[8 · Older\].*✅ DONE.*1\/1/);
      expect(readFileSync(join(root, '.midnite/tasks/done.md'), 'utf8')).toContain('Phase 8');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('markIndexDone touches only the row', () => {
    expect(markIndexDone(INDEX, 9)).toContain('| ✅ DONE |');
    expect(markIndexDone(INDEX, 9)).toContain('| [8 · Older]'.slice(1));
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
