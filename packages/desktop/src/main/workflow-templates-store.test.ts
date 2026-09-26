import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '@midnite/studio-shared';

import {
  configureWorkflowTemplates,
  createWorkflowTemplatesStore,
  deleteWorkflowTemplate,
  listWorkflowTemplates,
  parseStoredTemplates,
  saveWorkflowTemplate,
} from './workflow-templates-store';

function userTemplate(id: string): WorkflowTemplate {
  return {
    id,
    title: `Mine ${id}`,
    blurb: '',
    source: '',
    tags: [],
    workflow: { name: 'Mine', nodes: [], edges: [] },
  } as WorkflowTemplate;
}

let directory = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'wf-templates-'));
  configureWorkflowTemplates(createWorkflowTemplatesStore(directory));
});

describe('user workflow templates (Phase 97 Theme L)', () => {
  it('saves, lists across a reload, and deletes', async () => {
    const saved = await saveWorkflowTemplate(userTemplate('a'));
    expect(saved.ok).toBe(true);

    configureWorkflowTemplates(createWorkflowTemplatesStore(directory));
    expect((await listWorkflowTemplates()).map((t) => t.id)).toEqual(['a']);

    expect((await deleteWorkflowTemplate('a')).ok).toBe(true);
    expect(await listWorkflowTemplates()).toEqual([]);
  });

  it('upserts by id rather than duplicating', async () => {
    await saveWorkflowTemplate(userTemplate('a'));
    await saveWorkflowTemplate({ ...userTemplate('a'), title: 'Renamed' });
    const list = await listWorkflowTemplates();
    expect(list).toHaveLength(1);
    expect(list[0]!.title).toBe('Renamed');
  });

  it('refuses an id that belongs to a built-in', async () => {
    const result = await saveWorkflowTemplate(userTemplate(WORKFLOW_TEMPLATES[0]!.id));
    expect(result.ok).toBe(false);
  });

  it('refuses to delete a template that does not exist', async () => {
    expect((await deleteWorkflowTemplate('nope')).ok).toBe(false);
  });

  it('drops one malformed entry, not the whole file', () => {
    const parsed = parseStoredTemplates({ version: 1, templates: [userTemplate('ok'), { id: '' }] });
    expect(parsed.map((t) => t.id)).toEqual(['ok']);
  });
});
