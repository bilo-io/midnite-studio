import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { applyOverrides, KIT_SKILLS, parseOverrides, run, scriptClosure, scriptDeps, scriptRefs } from './sync-template.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirs = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'sync-template-'));
  dirs.push(root);
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

describe('parseOverrides', () => {
  it('reads blocks and ignores the prose around them', () => {
    const r = parseOverrides('# why\n\n<<<<\nold a\nold b\n====\nnew\n>>>>\n\nmore prose\n<<<<\ngone\n====\n>>>>\n');
    expect(r).toEqual({ ok: true, blocks: [{ from: 'old a\nold b', to: 'new', line: 3 }, { from: 'gone', to: '', line: 11 }] });
  });

  it.each([
    ['<<<<\nx\n>>>>\n', 'expected ===='],
    ['<<<<\nx\n====\ny\n', 'unterminated'],
    ['====\n', 'outside a block'],
    ['<<<<\n====\ny\n>>>>\n', 'empty match text'],
  ])('rejects %j', (text, message) => {
    const r = parseOverrides(text);
    expect(r.ok).toBe(false);
    expect(r.message).toContain(message);
  });
});

describe('applyOverrides', () => {
  it('replaces every occurrence in every file and reports a block that matches nothing', () => {
    const r = applyOverrides({ a: 'x Studio x Studio', b: 'Studio' }, [{ from: 'Studio', to: 'repo', line: 1 }, { from: 'nowhere', to: '', line: 5 }], 'o.md');
    expect(r.files).toEqual({ a: 'x repo x repo', b: 'repo' });
    expect(r.stale).toEqual(['o.md:5: matches nothing: "nowhere"']);
  });
});

describe('script references', () => {
  it('finds script paths in prose and relative deps in code', () => {
    expect(scriptRefs('run `node scripts/skills/tracker.mjs index` then scripts/skills/push.sh.')).toEqual(['scripts/skills/tracker.mjs', 'scripts/skills/push.sh']);
    expect(scriptDeps('scripts/skills/a.mjs', "import { x } from './lib/x.mjs';\nconst y = await import('../y.mjs');\nimport './side.mjs';")).toEqual(['scripts/skills/lib/x.mjs', 'scripts/y.mjs', 'scripts/skills/side.mjs']);
    expect(scriptDeps('scripts/skills/a.sh', 'exec node "$here/a.mjs" "${here}/lib/b.mjs"')).toEqual(['scripts/skills/a.mjs', 'scripts/skills/lib/b.mjs']);
  });

  it('follows imports, skips tests and refuses to leave scripts/skills', () => {
    const root = tree({
      'scripts/skills/a.mjs': "import './lib/b.mjs';",
      'scripts/skills/lib/b.mjs': "import '../../root.mjs';",
      'scripts/root.mjs': '',
    });
    const r = scriptClosure(root, ['scripts/skills/a.mjs', 'scripts/skills/missing.mjs']);
    expect(r.scripts).toEqual(['scripts/skills/a.mjs', 'scripts/skills/lib/b.mjs']);
    expect(r.errors).toEqual(['referenced script does not exist: scripts/skills/missing.mjs', 'script closure leaves scripts/skills/: scripts/root.mjs (a kit script may not import repo-only code)']);
  });
});

describe('run on a fixture repo', () => {
  function fixture() {
    const files = { 'docs/TRACKER.md': '# Tracker\n', 'scripts/skills/tool.sh': '#!/bin/sh\nexec node "$here/lib/h.mjs"\n', 'scripts/skills/lib/h.mjs': 'export {};\n' };
    for (const s of KIT_SKILLS) for (const m of ['.claude', '.agents']) files[`${m}/skills/${s}/SKILL.md`] = `# ${s}\nRun \`scripts/skills/tool.sh\`.\n`;
    files['.claude/skills/midnite-build/SKILL.md'] = '# build for **Midnite Studio**\nRun `scripts/skills/tool.sh`.\n';
    files['.agents/skills/midnite-build/SKILL.md'] = files['.claude/skills/midnite-build/SKILL.md'];
    files['templates/midnite-overrides/_all.md'] = '<<<<\n**Midnite Studio**\n====\n**this repo**\n>>>>\n';
    const root = tree(files);
    chmodSync(join(root, 'scripts/skills/tool.sh'), 0o755);
    return root;
  }

  it('reports a missing kit, writes it, then reads back in sync', () => {
    const root = fixture();
    const before = run(root);
    expect(before.code).toBe(1);
    expect(before.lines).toContain('missing: templates/midnite/scripts/skills/lib/h.mjs');
    expect(run(root, { write: true }).code).toBe(0);
    expect(run(root)).toMatchObject({ code: 0 });
    expect(readFileSync(join(root, 'templates/midnite/.claude/skills/midnite-build/SKILL.md'), 'utf8')).toBe('# build for **this repo**\nRun `scripts/skills/tool.sh`.\n');
    expect(statSync(join(root, 'templates/midnite/scripts/skills/tool.sh')).mode & 0o111).not.toBe(0);
  });

  it('fails when a skill changes and the kit does not, or when an override goes stale', () => {
    const root = fixture();
    run(root, { write: true });
    writeFileSync(join(root, '.claude/skills/midnite-plan/SKILL.md'), '# plan, changed\n');
    expect(run(root).lines).toContain('drifted: templates/midnite/.claude/skills/midnite-plan/SKILL.md');
    writeFileSync(join(root, '.claude/skills/midnite-build/SKILL.md'), '# build for **Studio**\n');
    writeFileSync(join(root, '.agents/skills/midnite-build/SKILL.md'), '# build for **Studio**\n');
    expect(run(root, { write: true }).lines.some((l) => l.startsWith('stale override: templates/midnite-overrides/_all.md:1'))).toBe(true);
  });

  it('lints a repo-specific token, an unshipped skill reference and a stray kit file', () => {
    const root = fixture();
    writeFileSync(join(root, '.claude/skills/midnite-plan/SKILL.md'), 'push as bilo-io, then /midnite-pr-review\n');
    mkdirSync(join(root, '.claude/skills/midnite-pr-review'), { recursive: true });
    writeFileSync(join(root, '.claude/skills/midnite-pr-review/SKILL.md'), 'x');
    run(root, { write: true });
    mkdirSync(join(root, 'templates/midnite/scripts/skills/old'), { recursive: true });
    writeFileSync(join(root, 'templates/midnite/scripts/skills/old/x.mjs'), '');
    const lines = run(root).lines;
    expect(lines).toContain('lint: templates/midnite/.claude/skills/midnite-plan/SKILL.md: still names "bilo-io" (add an override)');
    expect(lines).toContain('lint: templates/midnite/.claude/skills/midnite-plan/SKILL.md: refers to /midnite-pr-review, which the kit does not ship (add an override)');
    expect(lines).toContain('stale file: templates/midnite/scripts/skills/old/x.mjs (nothing generates it)');
  });
});

describe('the real kit', () => {
  it('is in sync with this repo (run `node scripts/skills/sync-template.mjs --write` and review)', () => {
    const r = run(repoRoot);
    expect(r.lines.join('\n')).toMatch(/is in sync/);
    expect(r.code).toBe(0);
  });
});
