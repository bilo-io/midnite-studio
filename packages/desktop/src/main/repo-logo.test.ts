import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REPO_LOGO_MAX_BYTES, clearRepoLogoCache, findRepoLogo, findRepoLogoPath } from './repo-logo';

let root: string;
const put = async (rel: string, content: string | Buffer = 'x') => {
  const full = join(root, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
};
const rel = (p: string | null) => (p ? p.slice(root.length + 1) : null);

beforeEach(async () => {
  clearRepoLogoCache();
  root = await mkdtemp(join(tmpdir(), 'repo-logo-'));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe('findRepoLogoPath', () => {
  it('returns null for an empty repo', async () => {
    expect(await findRepoLogoPath(root)).toBeNull();
  });

  it('finds a root favicon', async () => {
    await put('favicon.ico');
    expect(rel(await findRepoLogoPath(root))).toBe('favicon.ico');
  });

  it('prefers svg over png over ico', async () => {
    await put('favicon.ico');
    await put('public/favicon.png', 'pngpng');
    expect(rel(await findRepoLogoPath(root))).toBe('public/favicon.png');
    await put('static/favicon.svg');
    expect(rel(await findRepoLogoPath(root))).toBe('static/favicon.svg');
  });

  it('prefers logo over favicon within a format, and the larger png', async () => {
    await put('favicon.svg');
    await put('logo.svg');
    expect(rel(await findRepoLogoPath(root))).toBe('logo.svg');
    await rm(join(root, 'logo.svg'));
    await rm(join(root, 'favicon.svg'));
    await put('public/favicon.png', 'a');
    await put('assets/favicon.png', 'aaaaaaaa');
    expect(rel(await findRepoLogoPath(root))).toBe('assets/favicon.png');
  });

  it('finds .github and monorepo locations', async () => {
    await put('.github/logo.png');
    expect(rel(await findRepoLogoPath(root))).toBe('.github/logo.png');
    await put('packages/web/public/favicon.svg');
    expect(rel(await findRepoLogoPath(root))).toBe('packages/web/public/favicon.svg');
  });

  it('ignores node_modules, dist and oversize files', async () => {
    await put('node_modules/pkg/logo.svg');
    await put('dist/logo.svg');
    await put('packages/node_modules/public/logo.svg');
    await put('logo.svg', Buffer.alloc(REPO_LOGO_MAX_BYTES + 1));
    expect(await findRepoLogoPath(root)).toBeNull();
  });
});

describe('findRepoLogo', () => {
  it('returns a data url and caches per path', async () => {
    await put('logo.svg', '<svg/>');
    const first = await findRepoLogo(root);
    expect(first).toBe(`data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`);
    await rm(join(root, 'logo.svg'));
    expect(await findRepoLogo(root)).toBe(first);
  });

  it('returns null for a missing directory without throwing', async () => {
    expect(await findRepoLogo(join(root, 'nope'))).toBeNull();
  });
});
