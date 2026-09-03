import type { WorkflowEdge, WorkflowNode } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { NodeInspector } from './node-inspector';

function httpNode(id: string, label: string, url = ''): WorkflowNode {
  return {
    id,
    label,
    x: 0,
    y: 0,
    kind: 'http',
    config: { method: 'GET', url, headers: {}, params: {}, queryShaped: false },
  };
}

function noteNode(id: string, label: string): WorkflowNode {
  return { id, label, x: 0, y: 0, kind: 'note', config: { text: '' } };
}

function Harness({
  nodes,
  edges,
  selectedId,
}: {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedId: string | null;
}) {
  const [all, setAll] = useState(nodes);
  const selected = all.find((node) => node.id === selectedId) ?? null;
  return (
    <NodeInspector
      node={selected}
      nodes={all}
      edges={edges}
      onChange={(next) => setAll(all.map((node) => (node.id === next.id ? next : node)))}
    />
  );
}

describe('NodeInspector', () => {
  afterEach(() => cleanup());

  it('shows the empty state when nothing is selected', () => {
    render(<Harness nodes={[httpNode('a', 'HTTP')]} edges={[]} selectedId={null} />);
    expect(screen.getByText('Select a node to configure it.')).not.toBeNull();
  });

  it("renders the selected node's kind-specific form", () => {
    render(<Harness nodes={[httpNode('a', 'HTTP')]} edges={[]} selectedId="a" />);
    expect(screen.getByLabelText('URL')).not.toBeNull();
  });

  it('renders a note without any URL/method fields', () => {
    render(<Harness nodes={[noteNode('a', 'A note')]} edges={[]} selectedId="a" />);
    expect(screen.queryByLabelText('URL')).toBeNull();
    expect(screen.getByLabelText('Text')).not.toBeNull();
  });

  it('editing the node label calls onChange with the whole next node', () => {
    render(<Harness nodes={[httpNode('a', 'HTTP')]} edges={[]} selectedId="a" />);
    fireEvent.change(screen.getByLabelText('Node label'), { target: { value: 'Fetch user' } });
    expect((screen.getByLabelText('Node label') as HTMLInputElement).value).toBe('Fetch user');
  });

  it('shows the validation issue passed in for the selected node', () => {
    render(
      <NodeInspector
        node={httpNode('a', 'HTTP')}
        nodes={[httpNode('a', 'HTTP')]}
        edges={[]}
        issue={{ message: '"HTTP" has no URL.', nodeId: 'a' }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('"HTTP" has no URL.')).not.toBeNull();
  });

  it("offers upstream nodes' output fields once a field is focused, and inserts one at the caret", () => {
    const upstream = httpNode('up', 'Upstream');
    const edges: WorkflowEdge[] = [{ id: 'e1', from: 'up', to: 'a' }];
    render(<Harness nodes={[upstream, httpNode('a', 'HTTP')]} edges={edges} selectedId="a" />);

    const url = screen.getByLabelText('URL') as HTMLInputElement;
    fireEvent.focus(url);

    expect(screen.getByText('Insert a reference')).not.toBeNull();
    const insert = screen.getByRole('button', { name: /up\.status/ });
    fireEvent.click(insert);

    expect(url.value).toBe('{{up.status}}');
  });

  it('does not offer references from a node it is not reachable from', () => {
    const unrelated = httpNode('other', 'Other');
    render(<Harness nodes={[unrelated, httpNode('a', 'HTTP')]} edges={[]} selectedId="a" />);

    fireEvent.focus(screen.getByLabelText('URL'));
    expect(screen.queryByText('Insert a reference')).toBeNull();
  });
});
