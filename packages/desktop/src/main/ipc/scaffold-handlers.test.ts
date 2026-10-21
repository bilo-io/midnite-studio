import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHANNELS } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { handle, resolveWorkdir, fixture } = vi.hoisted(() => ({
  handle: vi.fn(),
  resolveWorkdir: vi.fn(),
  fixture: { home: '', template: '' },
}));
vi.mock('electron', () => ({ ipcMain: { handle } }));
vi.mock('../repo-registry', () => ({ resolveWorkdir }));
vi.mock('../window-manager', () => ({ resolveWindow: vi.fn() }));
vi.mock('../template-path', () => ({ templateRoot: () => fixture.template }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => fixture.home };
});

import { registerScaffoldHandlers } from './scaffold-handlers';

/** The `ipcMain.handle` listener main registered for `channel`, invoked the way `ipcRenderer.invoke` would. */
function invoke(channel: string, raw: unknown): Promise<unknown> {
  const [, listener] = handle.mock.calls.find(([ch]) => ch === channel) ?? [];
  if (typeof listener !== 'function') throw new Error(`no handler registered for ${channel}`);
  return listener({}, raw);
}

const dirs: string[] = [];
async function tmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mstudio-known-skills-'));
  dirs.push(dir);
  return dir;
}
async function skill(root: string, name: string, description?: string): Promise<void> {
  await mkdir(join(root, name), { recursive: true });
  const desc = description === undefined ? '' : `description: ${description}\n`;
  await writeFile(join(root, name, 'SKILL.md'), `---\nname: ${name}\n${desc}---\n# body`);
}

describe('scaffoldListKnownSkills', () => {
  let repoDir: string;

  beforeEach(async () => {
    handle.mockClear();
    resolveWorkdir.mockReset();
    fixture.home = await tmp();
    fixture.template = await tmp();
    repoDir = await tmp();
    await skill(join(fixture.template, '.claude', 'skills'), 'midnite-sitrep', 'Status table.');
    await skill(join(fixture.home, '.claude', 'skills'), 'pr-review', 'Personal review.');
    await skill(join(repoDir, '.agents', 'skills'), 'ekko-pr-review', 'Repo review.');
    registerScaffoldHandlers();
  });

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it('lists bundled, repo and user skills labelled by source', async () => {
    resolveWorkdir.mockResolvedValue(repoDir);
    await expect(invoke(CHANNELS.scaffoldListKnownSkills, { repoId: 'r1' })).resolves.toEqual({
      ok: true,
      value: {
        skills: [
          { name: 'ekko-pr-review', description: 'Repo review.', source: 'repo' },
          { name: 'midnite-sitrep', description: 'Status table.', source: 'midnite' },
          { name: 'pr-review', description: 'Personal review.', source: 'user' },
        ],
      },
    });
    expect(resolveWorkdir).toHaveBeenCalledWith('r1');
  });

  it('still answers bundled and user skills with no repo, or one that is not open', async () => {
    resolveWorkdir.mockResolvedValue(null);
    const names = async (raw: unknown) =>
      ((await invoke(CHANNELS.scaffoldListKnownSkills, raw)) as { value: { skills: { name: string }[] } })
        .value.skills.map((s) => s.name);
    await expect(names({})).resolves.toEqual(['midnite-sitrep', 'pr-review']);
    await expect(names({ repoId: 'gone' })).resolves.toEqual(['midnite-sitrep', 'pr-review']);
  });

  it('answers an invalid payload, or a failed lookup, with the error envelope — never a throw', async () => {
    await expect(invoke(CHANNELS.scaffoldListKnownSkills, { repoId: 42 })).resolves.toMatchObject({
      ok: false,
      kind: 'error',
    });
    resolveWorkdir.mockRejectedValue(new Error('registry exploded'));
    await expect(invoke(CHANNELS.scaffoldListKnownSkills, { repoId: 'r1' })).resolves.toMatchObject({
      ok: false,
      message: 'registry exploded',
    });
  });
});
