import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  appendPrivateFileSync,
  assertNotAgentConfig,
  ensurePrivateDir,
  tightenTree,
  writePrivateFile,
} from './private-files';

const mode = (p: string): number => statSync(p).mode & 0o777;
const tmp = (): string => mkdtempSync(join(tmpdir(), 'priv-'));

describe('private files', () => {
  it('creates dirs 0700 and tightens a looser existing one', async () => {
    const root = tmp();
    const d = join(root, 'a', 'b');
    await ensurePrivateDir(d);
    expect(mode(d)).toBe(0o700);
    mkdirSync(join(root, 'loose'), { mode: 0o755 });
    await ensurePrivateDir(join(root, 'loose'));
    expect(mode(join(root, 'loose'))).toBe(0o700);
  });

  it('writes 0600, atomically, leaving no temp file', async () => {
    const root = tmp();
    const f = join(root, 'x', 'y.json');
    await writePrivateFile(f, 'one');
    await writePrivateFile(f, 'two');
    expect(readFileSync(f, 'utf8')).toBe('two');
    expect(mode(f)).toBe(0o600);
    expect(mode(join(root, 'x'))).toBe(0o700);
    expect(readdirSync(join(root, 'x'))).toEqual(['y.json']);
  });

  it('appends at 0600 on creation', () => {
    const root = tmp();
    const f = join(root, 'log');
    appendPrivateFileSync(f, 'a');
    appendPrivateFileSync(f, 'b');
    expect(readFileSync(f, 'utf8')).toBe('ab');
    expect(mode(f)).toBe(0o600);
  });

  it('tightenTree is idempotent and reports what it changed', () => {
    const root = tmp();
    mkdirSync(join(root, 'd'), { mode: 0o755 });
    writeFileSync(join(root, 'd', 'f'), 'x', { mode: 0o644 });
    expect(tightenTree([root])).toEqual({ dirs: expect.any(Number), files: 1 });
    expect(mode(join(root, 'd'))).toBe(0o700);
    expect(mode(join(root, 'd', 'f'))).toBe(0o600);
    expect(tightenTree([root, join(root, 'missing')])).toEqual({ dirs: 0, files: 0 });
  });

  it('refuses agent config, allows skills and other paths', async () => {
    const home = '/Users/x';
    expect(() => assertNotAgentConfig('/Users/x/.claude/settings.json', home)).toThrow();
    expect(() => assertNotAgentConfig('/Users/x/.claude.json', home)).toThrow();
    expect(() => assertNotAgentConfig('/Users/x/.Claude/settings.json', home)).toThrow();
    expect(() => assertNotAgentConfig('/Users/x/.codex/config.toml', home)).toThrow();
    expect(() => assertNotAgentConfig('/Users/x/.claude/skills/a/SKILL.md', home)).not.toThrow();
    expect(() => assertNotAgentConfig('/Users/x/Library/App/f', home)).not.toThrow();
    expect(() => assertNotAgentConfig('/other/.claude/settings.json', home)).not.toThrow();
  });
});

describe('tightenHistoryModes', () => {
  it('tightens the known history stores and ignores the rest', async () => {
    const { tightenHistoryModes } = await import('./private-files');
    const root = tmp();
    mkdirSync(join(root, 'scrollback'), { mode: 0o755 });
    writeFileSync(join(root, 'scrollback', 'a.bin'), 'x', { mode: 0o644 });
    writeFileSync(join(root, 'terminals.json'), '{}', { mode: 0o644 });
    writeFileSync(join(root, 'other.json'), '{}', { mode: 0o644 });
    tightenHistoryModes(root);
    expect(mode(join(root, 'scrollback'))).toBe(0o700);
    expect(mode(join(root, 'scrollback', 'a.bin'))).toBe(0o600);
    expect(mode(join(root, 'terminals.json'))).toBe(0o600);
    expect(mode(join(root, 'other.json'))).toBe(0o644);
  });
});
