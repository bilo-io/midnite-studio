import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { VIDEO_ENGINES, parseVideoConfig } from '@midnite/studio-shared';
import { afterEach, describe, expect, it } from 'vitest';

import {
  VIDEO_ASSET_DIRS,
  VIDEO_COMMON_TEMPLATE_FILES,
  VIDEO_ENGINE_TEMPLATE_FILES,
  VIDEO_EXAMPLE_PROJECT_ID,
  VIDEO_TEMPLATE_FILES,
  scaffoldManifest,
  scaffoldVideoWorkspace,
} from './scaffold';

const TEMPLATE = join(__dirname, '..', '..', '..', '..', '..', 'templates', 'media-video');

let tmp: string | null = null;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

describe('templates/media-video manifest (Phase 99 Theme D, Theme H)', () => {
  it.each(VIDEO_TEMPLATE_FILES)('ships %s', (file) => {
    expect(existsSync(join(TEMPLATE, file))).toBe(true);
  });

  it('ships the example project Setup Video opens', () => {
    expect(existsSync(join(TEMPLATE, 'projects', VIDEO_EXAMPLE_PROJECT_ID, 'project.json'))).toBe(
      true,
    );
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

  it('keeps every engine app under its own directory and shares the rest', () => {
    for (const engine of VIDEO_ENGINES) {
      const appDir = engine === 'remotion' ? 'video-editor/' : 'hyperframes-editor/';
      for (const file of VIDEO_ENGINE_TEMPLATE_FILES[engine])
        expect(file.startsWith(appDir)).toBe(true);
    }
    for (const file of VIDEO_COMMON_TEMPLATE_FILES) {
      expect(file.startsWith('video-editor/') || file.startsWith('hyperframes-editor/')).toBe(
        false,
      );
    }
  });

  it('gives both engines the same example project, so project.json is engine-neutral', () => {
    const project = JSON.parse(
      readFileSync(join(TEMPLATE, 'projects', VIDEO_EXAMPLE_PROJECT_ID, 'project.json'), 'utf8'),
    );
    // Remotion registers this id; HyperFrames' example declares the same `data-composition-id`.
    expect(project.composition).toBe('ExampleHello');
    const html = readFileSync(
      join(TEMPLATE, 'hyperframes-editor', 'projects', VIDEO_EXAMPLE_PROJECT_ID, 'index.html'),
      'utf8',
    );
    expect(html).toContain(`data-composition-id="${project.composition}"`);
    expect(html).toContain(`window.__timelines["${project.composition}"]`);
  });

  it('pins the hyperframes CLI to an exact version for reproducible renders', () => {
    const pkg = JSON.parse(
      readFileSync(join(TEMPLATE, 'hyperframes-editor', 'package.json'), 'utf8'),
    );
    expect(pkg.devDependencies.hyperframes).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('carries both editorial skills with an engine section for each engine', () => {
    for (const skill of ['video-write-editorial-script', 'video-execute-editorial-script']) {
      const text = readFileSync(join(TEMPLATE, '.claude', 'skills', skill, 'SKILL.md'), 'utf8');
      expect(text).toContain('video.config.json');
      expect(text).toContain('HyperFrames');
      expect(text).toContain('Remotion');
    }
  });
});

describe('scaffoldManifest', () => {
  it('is the common files plus exactly one engine app', () => {
    expect(scaffoldManifest('remotion')).toEqual([
      ...VIDEO_COMMON_TEMPLATE_FILES,
      ...VIDEO_ENGINE_TEMPLATE_FILES.remotion,
    ]);
    expect(scaffoldManifest('hyperframes')).toContain('hyperframes-editor/package.json');
    expect(scaffoldManifest('hyperframes')).not.toContain('video-editor/package.json');
  });
});

describe('scaffoldVideoWorkspace', () => {
  it('copies the Remotion template by default, records the engine, and creates the empty asset folders', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'video-scaffold-'));
    const dest = join(tmp, '.midnite', 'media', 'video');
    const result = await scaffoldVideoWorkspace(TEMPLATE, dest);
    expect(result.ok).toBe(true);
    for (const file of scaffoldManifest('remotion'))
      expect(existsSync(join(dest, file))).toBe(true);
    for (const dir of VIDEO_ASSET_DIRS) expect(existsSync(join(dest, 'assets', dir))).toBe(true);
    expect(existsSync(join(dest, 'hyperframes-editor'))).toBe(false);
    expect(parseVideoConfig(readFileSync(join(dest, 'video.config.json'), 'utf8')).engine).toBe(
      'remotion',
    );
  });

  it('scaffolds HyperFrames without the Remotion app', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'video-scaffold-'));
    const dest = join(tmp, 'video');
    const result = await scaffoldVideoWorkspace(TEMPLATE, dest, 'hyperframes');
    expect(result.ok).toBe(true);
    for (const file of scaffoldManifest('hyperframes'))
      expect(existsSync(join(dest, file))).toBe(true);
    expect(existsSync(join(dest, 'video-editor'))).toBe(false);
    expect(parseVideoConfig(readFileSync(join(dest, 'video.config.json'), 'utf8')).engine).toBe(
      'hyperframes',
    );
    // Same project layout either way.
    expect(existsSync(join(dest, 'projects', 'example', '000-hello', 'project.json'))).toBe(true);
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
