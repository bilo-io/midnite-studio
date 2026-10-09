import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { scaffoldVideoWorkspace } from './scaffold';

/**
 * The template's own `scripts/` are plain Node and carry the engine dispatch
 * (Phase 99 Theme H), so they are exercised here the way a user runs them — a
 * real scaffolded workspace, `node scripts/…` — with no network and no
 * browser: sync-assets copies files, and render.mjs is only taken as far as
 * its argument and project validation (a real render is the smoke test).
 */
const TEMPLATE = join(__dirname, '..', '..', '..', '..', '..', 'templates', 'media-video');

// Each case spawns node a few times; the gate runs every package's tests at once.
vi.setConfig({ testTimeout: 90_000 });

let tmp: string | null = null;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

async function workspace(engine: 'remotion' | 'hyperframes'): Promise<string> {
  tmp = mkdtempSync(join(tmpdir(), 'video-scripts-'));
  const root = join(tmp, 'video');
  expect((await scaffoldVideoWorkspace(TEMPLATE, root, engine)).ok).toBe(true);
  mkdirSync(join(root, 'assets', 'logos'), { recursive: true });
  writeFileSync(join(root, 'assets', 'logos', 'mark.svg'), '<svg/>');
  writeFileSync(join(root, 'projects', 'example', '000-hello', 'input', 'clip.mp4'), 'x');
  writeFileSync(join(root, 'projects', 'example', '000-hello', 'input', 'BRIEF.md'), 'not media');
  return root;
}

const node = (root: string, ...args: string[]) =>
  spawnSync('node', args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DO_NOT_TRACK: '1' },
  });

describe('scripts/sync-assets.mjs — dispatches on video.config.json', () => {
  it('Remotion: one mirror in video-editor/public, project media under projects/<id>/', async () => {
    const root = await workspace('remotion');
    const run = node(root, 'scripts/sync-assets.mjs');
    expect(run.status).toBe(0);
    expect(existsSync(join(root, 'video-editor', 'public', 'logos', 'mark.svg'))).toBe(true);
    expect(
      existsSync(
        join(root, 'video-editor', 'public', 'projects', 'example', '000-hello', 'clip.mp4'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(root, 'video-editor', 'public', 'projects', 'example', '000-hello', 'BRIEF.md'),
      ),
    ).toBe(false);
  });

  it('HyperFrames: a mirror per project, shared media under assets/<kind>, own media under assets/input', async () => {
    const root = await workspace('hyperframes');
    const run = node(root, 'scripts/sync-assets.mjs');
    expect(run.status).toBe(0);
    const mirror = join(root, 'hyperframes-editor', 'projects', 'example', '000-hello', 'assets');
    expect(existsSync(join(mirror, 'logos', 'mark.svg'))).toBe(true);
    expect(existsSync(join(mirror, 'input', 'clip.mp4'))).toBe(true);
    expect(existsSync(join(mirror, 'input', 'BRIEF.md'))).toBe(false);
    // Never into the Remotion location.
    expect(existsSync(join(root, 'video-editor'))).toBe(false);
  });

  it('HyperFrames: --prune drops a mirrored file whose source is gone', async () => {
    const root = await workspace('hyperframes');
    node(root, 'scripts/sync-assets.mjs');
    rmSync(join(root, 'assets', 'logos', 'mark.svg'));
    const run = node(root, 'scripts/sync-assets.mjs', '--prune');
    expect(run.status).toBe(0);
    const mirror = join(root, 'hyperframes-editor', 'projects', 'example', '000-hello', 'assets');
    expect(existsSync(join(mirror, 'logos', 'mark.svg'))).toBe(false);
    expect(existsSync(join(mirror, 'input', 'clip.mp4'))).toBe(true);
  });

  it('a workspace with no video.config.json is Remotion (pre-engine workspaces keep working)', async () => {
    const root = await workspace('remotion');
    rmSync(join(root, 'video.config.json'));
    expect(node(root, 'scripts/sync-assets.mjs').status).toBe(0);
    expect(existsSync(join(root, 'video-editor', 'public', 'logos', 'mark.svg'))).toBe(true);
  });
});

describe('scripts/render.mjs — HyperFrames validation (no browser needed)', () => {
  it('names the missing composition rather than failing inside the CLI', async () => {
    const root = await workspace('hyperframes');
    rmSync(join(root, 'hyperframes-editor', 'projects', 'example', '000-hello', 'index.html'));
    const run = node(root, 'scripts/render.mjs', 'example/000-hello');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(
      'No HyperFrames composition at hyperframes-editor/projects/example/000-hello/index.html',
    );
  });

  it('rejects an output format HyperFrames cannot put in an output/vN file', async () => {
    const root = await workspace('hyperframes');
    const run = node(root, 'scripts/render.mjs', 'example/000-hello', '--format=hls');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Unsupported --format=hls');
  });

  it('still refuses a mistyped project id, as for Remotion', async () => {
    const root = await workspace('hyperframes');
    const run = node(root, 'scripts/render.mjs', 'example/000-helo');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('No such project');
  });
});
