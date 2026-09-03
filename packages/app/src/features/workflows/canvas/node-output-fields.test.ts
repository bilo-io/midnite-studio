import type { WorkflowNode } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { declaredOutputFields } from './node-output-fields';

describe('declaredOutputFields', () => {
  it('lists the fixed http response shape', () => {
    const node: WorkflowNode = {
      id: 'n1',
      label: 'HTTP',
      x: 0,
      y: 0,
      kind: 'http',
      config: { method: 'GET', url: '', headers: {}, params: {}, queryShaped: false },
    };
    expect(declaredOutputFields(node)).toEqual(['status', 'headers', 'body', 'durationMs']);
  });

  it("lists a transform's picked field names, not its sources", () => {
    const node: WorkflowNode = {
      id: 'n2',
      label: 'Transform',
      x: 0,
      y: 0,
      kind: 'transform',
      config: { picks: [{ from: 'a.b', to: 'id' }, { from: 'c.d', to: 'name' }] },
    };
    expect(declaredOutputFields(node)).toEqual(['id', 'name']);
  });

  it('returns nothing for condition, delay and note', () => {
    const condition: WorkflowNode = {
      id: 'n3',
      label: 'Condition',
      x: 0,
      y: 0,
      kind: 'condition',
      config: { left: '', op: 'empty' },
    };
    const delay: WorkflowNode = { id: 'n4', label: 'Delay', x: 0, y: 0, kind: 'delay', config: { ms: 0 } };
    const note: WorkflowNode = { id: 'n5', label: 'Note', x: 0, y: 0, kind: 'note', config: { text: '' } };
    expect(declaredOutputFields(condition)).toEqual([]);
    expect(declaredOutputFields(delay)).toEqual([]);
    expect(declaredOutputFields(note)).toEqual([]);
  });
});
