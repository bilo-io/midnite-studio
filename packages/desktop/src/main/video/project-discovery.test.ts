import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createProject, discoverProjects, getProject, listOutputFiles } from './project-discovery';

let dirs: string[] = [];

const tempDir = async (prefix = 'mstudio-video-root-'): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  dirs = [];
});

/** Writes `<root>/projects/<id>/project.json`, creating the folder first. */
async function writeProject(
  root: string,
  id: string,
  fields: Partial<{
    id: string;
    title: string;
    composition: string;
    source: string;
    brief: string;
    script: string;
  }> = {},
): Promise<void> {
  const dir = join(root, 'projects', id);
  await mkdir(dir, { recursive: true });
  const file = {
    id,
    title: 'A project',
    composition: 'MyComp',
    source: 'input/original.mp4',
    brief: 'input/BRIEF.md',
    script: 'EDITORIAL_SCRIPT.md',
    ...fields,
  };
  await writeFile(join(dir, 'project.json'), JSON.stringify(file), 'utf8');
}

describe('discoverProjects', () => {
  it('returns nothing when the root has no projects directory yet', async () => {
    const root = await tempDir();
    expect(await discoverProjects(root)).toEqual([]);
  });

  it('discovers a valid project', async () => {
    const root = await tempDir();
    await writeProject(root, 'p1', { title: 'Showreel' });
    const projects = await discoverProjects(root);
    expect(projects).toEqual([
      {
        valid: true,
        id: 'p1',
        title: 'Showreel',
        composition: 'MyComp',
        source: 'input/original.mp4',
        brief: 'input/BRIEF.md',
        script: 'EDITORIAL_SCRIPT.md',
      },
    ]);
  });

  it('never lists `_template` as a project', async () => {
    const root = await tempDir();
    await writeProject(root, '_template');
    await writeProject(root, 'p1');
    const projects = await discoverProjects(root);
    expect(projects.map((p) => p.id)).toEqual(['p1']);
  });

  it('marks a folder with no project.json invalid, never a crash', async () => {
    const root = await tempDir();
    await mkdir(join(root, 'projects', 'empty-folder'), { recursive: true });
    const projects = await discoverProjects(root);
    expect(projects).toEqual([
      { valid: false, id: 'empty-folder', error: 'project.json is missing or unreadable.' },
    ]);
  });

  it('marks unparseable JSON invalid, carrying a reason', async () => {
    const root = await tempDir();
    const dir = join(root, 'projects', 'broken');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'project.json'), '{not json', 'utf8');
    const projects = await discoverProjects(root);
    expect(projects).toEqual([{ valid: false, id: 'broken', error: 'project.json is not valid JSON.' }]);
  });

  it('marks a project.json missing a required field invalid', async () => {
    const root = await tempDir();
    const dir = join(root, 'projects', 'incomplete');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'project.json'), JSON.stringify({ id: 'incomplete', title: 'X' }), 'utf8');
    const projects = await discoverProjects(root);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.valid).toBe(false);
  });

  it("marks a project.json whose own id does not match its folder invalid", async () => {
    const root = await tempDir();
    await writeProject(root, 'folder-name', { id: 'a-different-id' });
    const projects = await discoverProjects(root);
    expect(projects).toEqual([
      {
        valid: false,
        id: 'folder-name',
        error: 'project.json\'s id ("a-different-id") does not match its folder name.',
      },
    ]);
  });

  it('refuses a source/brief/script that resolves outside the configured root', async () => {
    const root = await tempDir();
    await writeProject(root, 'escaping', { source: '../../../../etc/passwd' });
    const projects = await discoverProjects(root);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.valid).toBe(false);
    expect((projects[0] as { error: string }).error).toContain('resolves outside the configured root');
  });

  it('refuses a project folder reached through a symlink pointing outside the root', async () => {
    const root = await tempDir();
    const outside = await tempDir('mstudio-video-outside-');
    await writeProject(outside, 'evil');
    await mkdir(join(root, 'projects'), { recursive: true });
    await symlink(join(outside, 'projects', 'evil'), join(root, 'projects', 'evil'), 'dir');

    const projects = await discoverProjects(root);
    expect(projects).toHaveLength(1);
    expect(projects[0]!.valid).toBe(false);
  });
});

describe('getProject', () => {
  it('finds one project by id among several', async () => {
    const root = await tempDir();
    await writeProject(root, 'p1', { title: 'First' });
    await writeProject(root, 'p2', { title: 'Second' });
    const found = await getProject(root, 'p2');
    expect(found?.valid).toBe(true);
    expect(found && 'title' in found ? found.title : undefined).toBe('Second');
  });

  it('returns null for an id that does not exist', async () => {
    const root = await tempDir();
    expect(await getProject(root, 'nope')).toBeNull();
  });
});

describe('createProject', () => {
  it('copies the template and patches id/title', async () => {
    const root = await tempDir();
    await writeProject(root, '_template', { id: 'NN-project-name', title: 'Human-readable title' });

    const result = await createProject(root, '02-new-video', 'My New Video');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        valid: true,
        id: '02-new-video',
        title: 'My New Video',
        composition: 'MyComp',
        source: 'input/original.mp4',
        brief: 'input/BRIEF.md',
        script: 'EDITORIAL_SCRIPT.md',
      });
    }

    const discovered = await getProject(root, '02-new-video');
    expect(discovered).toEqual(result.ok ? result.value : undefined);
  });

  it('refuses an id that already exists', async () => {
    const root = await tempDir();
    await writeProject(root, '_template');
    await writeProject(root, 'taken');

    const result = await createProject(root, 'taken', 'Another Title');
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'error') expect(result.message).toContain('already exists');
  });

  it('refuses to create when no template exists', async () => {
    const root = await tempDir();
    const result = await createProject(root, 'p1', 'X');
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'error') expect(result.message).toContain('template');
  });

  it("refuses `_template` itself as a project id", async () => {
    const root = await tempDir();
    await writeProject(root, '_template');
    const result = await createProject(root, '_template', 'X');
    expect(result.ok).toBe(false);
  });
});

describe('listOutputFiles', () => {
  it('parses `vN-<label>.mp4` filenames, ignoring anything else', async () => {
    const root = await tempDir();
    const outputDir = join(root, 'projects', 'p1', 'output');
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'v2-second-cut.mp4'), '', 'utf8');
    await writeFile(join(outputDir, 'v1-first-cut.mp4'), '', 'utf8');
    await writeFile(join(outputDir, 'notes.txt'), '', 'utf8');
    await writeFile(join(outputDir, '.DS_Store'), '', 'utf8');

    const files = await listOutputFiles(root, 'p1');
    expect(files).toEqual([
      { filename: 'v1-first-cut.mp4', iteration: 1, label: 'first-cut' },
      { filename: 'v2-second-cut.mp4', iteration: 2, label: 'second-cut' },
    ]);
  });

  it('returns an empty list when the project has no output directory yet', async () => {
    const root = await tempDir();
    await writeProject(root, 'p1');
    expect(await listOutputFiles(root, 'p1')).toEqual([]);
  });
});
