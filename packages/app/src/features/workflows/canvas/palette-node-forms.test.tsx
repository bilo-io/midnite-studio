import type { WorkflowNode, WorkflowNodeKind } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { createNode } from '../workflow-io';
import { NodeInspector } from './node-inspector';

/**
 * Every palette kind added after Phase 97 gets a real inspector form: the
 * node the palette drops (`createNode`) renders its own fields, and editing
 * the kind's primary field writes back through the inspector's single
 * `onChange` — the same round trip the older kinds' forms make.
 */

let latest: WorkflowNode | null = null;

function Harness({ initial }: { initial: WorkflowNode }) {
  const [node, setNode] = useState(initial);
  return (
    <NodeInspector
      node={node}
      nodes={[node]}
      edges={[]}
      onChange={(next) => {
        latest = next;
        setNode(next);
      }}
    />
  );
}

/** The one field each kind cannot run without, and where its value lands in `config`. */
const PRIMARY: Record<string, { label: string; read: (node: WorkflowNode) => unknown }> = {
  'ai-prompt': { label: 'Prompt', read: (n) => (n.kind === 'ai-prompt' ? n.config.prompt : null) },
  'ai-extract': { label: 'Source', read: (n) => (n.kind === 'ai-extract' ? n.config.source : null) },
  assert: { label: 'Value', read: (n) => (n.kind === 'assert' ? n.config.left : null) },
  fail: { label: 'Message', read: (n) => (n.kind === 'fail' ? n.config.message : null) },
  command: { label: 'Command', read: (n) => (n.kind === 'command' ? n.config.command : null) },
  'read-file': { label: 'Path', read: (n) => (n.kind === 'read-file' ? n.config.path : null) },
  'git-status': { label: 'Repository', read: (n) => (n.kind === 'git-status' ? n.config.repoId : null) },
  'forge-comment': { label: 'Body', read: (n) => (n.kind === 'forge-comment' ? n.config.body : null) },
  'forge-issue': { label: 'Title', read: (n) => (n.kind === 'forge-issue' ? n.config.title : null) },
  'json-extract': { label: 'Source', read: (n) => (n.kind === 'json-extract' ? n.config.source : null) },
  notify: { label: 'Title', read: (n) => (n.kind === 'notify' ? n.config.title : null) },
  'write-file': { label: 'Path', read: (n) => (n.kind === 'write-file' ? n.config.path : null) },
  clipboard: { label: 'Text', read: (n) => (n.kind === 'clipboard' ? n.config.text : null) },
};

describe('palette node forms', () => {
  afterEach(() => {
    cleanup();
    latest = null;
  });

  for (const [kind, primary] of Object.entries(PRIMARY)) {
    it(`${kind}: edits its ${primary.label.toLowerCase()} through the inspector`, () => {
      render(<Harness initial={createNode(kind as WorkflowNodeKind, 0, 0)} />);
      fireEvent.change(screen.getByLabelText(primary.label), { target: { value: 'typed' } });
      expect(latest).not.toBeNull();
      expect(primary.read(latest!)).toBe('typed');
    });
  }

  it('set-fields: adds a field row and edits its value', () => {
    render(<Harness initial={createNode('set-fields', 0, 0)} />);
    fireEvent.click(screen.getByLabelText('Add fields row'));
    fireEvent.change(screen.getByLabelText('Fields value 1'), { target: { value: '42' } });
    expect(latest?.kind === 'set-fields' && latest.config.fields).toEqual({ key: '42' });
  });

  it('coalesce: adds candidates in order', () => {
    render(<Harness initial={createNode('coalesce', 0, 0)} />);
    fireEvent.click(screen.getByLabelText('Add candidate'));
    fireEvent.change(screen.getByLabelText('Candidate 1'), { target: { value: '{{a.b}}' } });
    fireEvent.click(screen.getByLabelText('Add candidate'));
    expect(latest?.kind === 'coalesce' && latest.config.candidates).toEqual(['{{a.b}}', '']);
  });

  it('ai-extract: adds fields with unique default keys', () => {
    render(<Harness initial={createNode('ai-extract', 0, 0)} />);
    fireEvent.click(screen.getByLabelText('Add field'));
    fireEvent.click(screen.getByLabelText('Add field'));
    expect(latest?.kind === 'ai-extract' && latest.config.fields.map((f) => f.key)).toEqual(['field', 'field1']);
  });

  it('assert: hides the expected value for "is empty"', () => {
    render(<Harness initial={createNode('assert', 0, 0)} />);
    expect(screen.getByLabelText('Expected')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Must'), { target: { value: 'empty' } });
    expect(screen.queryByLabelText('Expected')).toBeNull();
  });
});
