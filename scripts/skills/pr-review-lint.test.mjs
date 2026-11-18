import { describe, expect, it } from 'vitest';
import { draftSuggestions, lint, parseDiff, renderMarkdown } from './pr-review-lint.mjs';

/** Build a one-file diff whose added lines are `lines`. */
const diffOf = (file, lines, { isNew = false } = {}) =>
  [`diff --git a/${file} b/${file}`, ...(isNew ? ['new file mode 100644'] : []), `--- a/${file}`, `+++ b/${file}`, `@@ -1,0 +10,${lines.length} @@`, ...lines.map((l) => `+${l}`)].join('\n');

const run = (file, lines, extra = {}) => lint({ files: parseDiff(diffOf(file, lines, extra)) }).findings;
const rules = (f) => f.map((x) => x.rule);

describe('parseDiff', () => {
  it('tracks files and new-side line numbers, and skips deletions', () => {
    const d = `${diffOf('a.ts', ['x', 'y'])}\ndiff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone`;
    const files = parseDiff(d);
    expect(files).toHaveLength(1);
    expect(files[0].added).toEqual([{ line: 10, text: 'x' }, { line: 11, text: 'y' }]);
  });
});

describe('static rubric', () => {
  it('flags git read commands without -z / %x00 in git-engine', () => {
    expect(rules(run('packages/git-engine/src/x.ts', ["const out = await execFile('git', ['log', '--oneline'])"]))).toContain('git-nul-delimited');
    expect(run('packages/git-engine/src/x.ts', ["const out = await execFile('git', ['log', '-z', '--format=%H%x00%s'])"])).toEqual([]);
    expect(run('packages/git-engine/src/x.test.ts', ["execFile('git', ['log'])"])).toEqual([]);
  });

  it('flags git writes that bypass the write queue, but not ones that use it', () => {
    expect(rules(run('packages/git-engine/src/ops.ts', ["await execFile('git', ['commit', '-m', msg])"]))).toContain('write-queue-bypass');
    expect(run('packages/git-engine/src/ops.ts', ["await writeQueue.enqueue(repo, () => execFile('git', ['commit', '-m', msg]))"])).toEqual([]);
    expect(run('packages/git-engine/src/exec/write-queue.ts', ["await execFile('git', ['commit'])"])).toEqual([]);
  });

  it('flags lucide-react as CRITICAL', () => {
    const [f] = run('packages/app/src/a.tsx', ["import { Check } from 'lucide-react';"]);
    expect(f).toMatchObject({ rule: 'lucide-react', severity: 'CRITICAL', line: 10 });
    expect(run('packages/app/src/a.tsx', ["import { LuCheck } from 'react-icons/lu';"])).toEqual([]);
  });

  it('flags Quick Kiss outside docs', () => {
    expect(rules(run('packages/app/src/styles.css', ["@font-face { font-family: 'Quick Kiss'; }"]))).toContain('quick-kiss');
    expect(run('docs/WEBSITE.md', ['Quick Kiss never comes back'])).toEqual([]);
  });

  it('flags hardcoded chords outside the registry and tests', () => {
    expect(rules(run('packages/app/src/k.tsx', ["if (combo === 'Mod+Shift+p') go();"]))).toContain('hardcoded-chord');
    expect(run('packages/shared/src/keybindings.ts', ["chord: 'Mod+k',"])).toEqual([]);
    expect(run('packages/app/src/k.test.tsx', ["press('Mod+k')"])).toEqual([]);
  });

  it('flags wall-clock assertions and bare waitForTimeout in tests only', () => {
    expect(rules(run('packages/app/src/a.test.ts', ['expect(elapsed).toBeLessThan(50);']))).toContain('wall-clock-assert');
    expect(run('packages/app/src/a.test.ts', ['expect(list.length).toBeLessThan(5);'])).toEqual([]);
    expect(rules(run('packages/app/e2e/a.spec.ts', ['await page.waitForTimeout(500);']))).toContain('bare-wait-for-timeout');
    expect(run('packages/app/e2e/a.spec.ts', ['await page.waitForTimeout(500); // allow-timeout: animation'])).toEqual([]);
    expect(run('packages/app/e2e/a.spec.ts', ['await settle(page, () => page.waitForTimeout(500));'])).toEqual([]);
  });

  it('flags a SCRATCHPAD.md added to the diff and a tracked one', () => {
    expect(rules(run('SCRATCHPAD.md', ['# notes'], { isNew: true }))).toEqual(['scratchpad-tracked']);
    expect(rules(lint({ files: [], scratchpadTracked: true }).findings)).toEqual(['scratchpad-tracked']);
  });

  it('flags Co-Authored-By and Signed-off-by trailers in commit messages', () => {
    const r = lint({ commits: [{ sha: 'abcdef123456', subject: 'feat: x', body: 'why\n\nCo-Authored-By: A <a@b.c>' }, { sha: '1', subject: 'fix: y', body: 'clean' }] });
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({ rule: 'attribution-trailer', severity: 'CRITICAL' });
  });

  it('orders by severity and summarises', () => {
    const files = parseDiff([diffOf('a.test.ts', ['expect(elapsed).toBeLessThan(5);']), diffOf('b.tsx', ["import x from 'lucide-react';"])].join('\n'));
    const r = lint({ files });
    expect(r.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING']);
    expect(r.summary).toEqual({ CRITICAL: 1, WARNING: 1, NIT: 0 });
    expect(renderMarkdown(r)).toContain('lucide-react');
    expect(renderMarkdown({ findings: [] })).toMatch(/No static/);
  });
});

describe('draftSuggestions', () => {
  const base = () => lint({ files: parseDiff(diffOf('a.tsx', ["import x from 'lucide-react';"])) });
  it('keeps the static hint with --no-llm and never calls the network', async () => {
    const fetch = () => {
      throw new Error('network');
    };
    const r = await draftSuggestions(base(), { noLlm: true, fetch });
    expect(r.suggestionSource).toBe('static');
    expect(r.findings[0].draft).toBeUndefined();
  });

  it('attaches a model draft when a mocked daemon answers', async () => {
    const fetch = async (url) =>
      url.endsWith('/api/tags')
        ? { ok: true, json: async () => ({ models: [{ name: 'qwen3.5:9b' }] }) }
        : { ok: true, json: async () => ({ response: 'Use react-icons/lu.', message: { content: 'Use react-icons/lu.' } }) };
    const r = await draftSuggestions(base(), { noLlm: false, fetch });
    if (r.suggestionSource === 'ollama') expect(r.findings[0].draft).toMatch(/react-icons/);
    else expect(r.findings[0].suggestion).toMatch(/react-icons/);
  });
});
