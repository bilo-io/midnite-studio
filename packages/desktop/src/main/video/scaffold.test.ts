import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { VIDEO_ASSET_DIRS, VIDEO_EXAMPLE_PROJECT_ID, VIDEO_TEMPLATE_FILES, scaffoldVideoWorkspace } from './scaffold';

const TEMPLATE = join(__dirname, '..', '..', '..', '..', '..', 'templates', 'media-video');

let tmp: string | null = null;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe('templates/media-video manifest (Phase 99 Theme D)', () => {
  it.each(VIDEO_TEMPLATE_FILES)('ships %s', (file) => {
    expect(existsSync(join(TEMPLATE, file))).toBe(true);
  });

  it('ships the example project Setup Video opens', () => {
    expect(existsSync(join(TEMPLATE, 'projects', VIDEO_EXAMPLE_PROJECT_ID, 'project.json'))).toBe(true);
  });

  it('carries no rendered output or installed dependencies', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(TEMPLATE);
    expect(files.some((f) => /\.(mp4|webm|mov|gif|wav|mp3)$/.test(f))).toBe(false);
    expect(files.some((f) => f.includes('node_modules'))).toBe(false);
  });
});

describe('scaffoldVideoWorkspace', () => {
  it('copies the template and creates the empty asset folders', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'video-scaffold-'));
    const dest = join(tmp, '.midnite', 'media', 'video');
    const result = await scaffoldVideoWorkspace(TEMPLATE, dest);
    expect(result.ok).toBe(true);
    for (const file of VIDEO_TEMPLATE_FILES) expect(existsSync(join(dest, file))).toBe(true);
    for (const dir of VIDEO_ASSET_DIRS) expect(existsSync(join(dest, 'assets', dir))).toBe(true);
  });

  it('refuses a non-empty destination', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'video-scaffold-'));
    writeFileSync(join(tmp, 'keep.txt'), 'x');
    const result = await scaffoldVideoWorkspace(TEMPLATE, tmp);
    expect(result.ok).toBe(false);
  });

  it('fails cleanly when the template is missing from the build', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'video-scaffold-'));
    const result = await scaffoldVideoWorkspace(join(tmp, 'nope'), join(tmp, 'dest'));
    expect(result.ok).toBe(false);
  });
});
