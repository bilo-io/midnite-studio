import type { ForgeProjectField } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { groupableFields, resolveGroupField } from './resolve-group-field';

const status: ForgeProjectField = { id: 'status', name: 'Status', dataType: 'single_select', options: [] };
const priority: ForgeProjectField = { id: 'priority', name: 'Priority', dataType: 'single_select', options: [] };
const sprint: ForgeProjectField = { id: 'sprint', name: 'Sprint', dataType: 'iteration' };
const notes: ForgeProjectField = { id: 'notes', name: 'Notes', dataType: 'text' };

describe('resolveGroupField', () => {
  it('uses the preferred field when it still exists and is groupable', () => {
    expect(resolveGroupField([status, priority], 'priority')).toBe(priority);
  });

  it('falls back to Status when the preferred field was deleted from the project', () => {
    expect(resolveGroupField([status, priority], 'deleted-field-id')).toBe(status);
  });

  it('falls back to Status when nothing was ever chosen', () => {
    expect(resolveGroupField([priority, status], null)).toBe(status);
  });

  it('falls back to the first groupable field when there is no Status field at all', () => {
    expect(resolveGroupField([notes, priority, sprint], null)).toBe(priority);
  });

  it('never resolves to a non-groupable field, even if explicitly preferred', () => {
    expect(resolveGroupField([notes, status], 'notes')).toBe(status);
  });

  it('is null when the project has no single_select or iteration field at all', () => {
    expect(resolveGroupField([notes], null)).toBeNull();
  });
});

describe('groupableFields', () => {
  it('keeps only single_select and iteration fields, in their original order', () => {
    expect(groupableFields([notes, status, sprint, priority])).toEqual([status, sprint, priority]);
  });
});
