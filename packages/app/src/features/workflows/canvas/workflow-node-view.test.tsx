import type { WorkflowNode, WorkflowNodeStatus } from '@midnite/studio-shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { WorkflowCanvas, type WorkflowGraph } from './workflow-canvas';

/**
 * Handle colour and node shape (Phase 97 Theme J) — vitest/jsdom rather than
 * a Playwright spec: this only asserts DOM attributes (`style.background`,
 * class names) a `render()` mount already exposes, none of real layout,
 * pointer interaction or actual SVG path rendering, which is what
 * `workflows-canvas.spec.ts`'s visual baseline (real CSS/SVG path
 * rendering) is for instead.
 */
beforeAll(() => {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  vi.setConfig({ testTimeout: 15000 });
});

afterEach(() => cleanup());

const httpNode: WorkflowNode = {
  id: 'n1',
  label: 'Fetch',
  x: 0,
  y: 0,
  kind: 'http',
  config: { method: 'GET', url: 'https://example.com', headers: {}, params: {}, queryShaped: false },
};

const conditionNode: WorkflowNode = {
  id: 'n2',
  label: 'Check',
  x: 300,
  y: 0,
  kind: 'condition',
  config: { left: '{{n1.body.status}}', op: 'eq', right: 'ok' },
};

const joinNode: WorkflowNode = {
  id: 'n3',
  label: 'Merge',
  x: 600,
  y: 0,
  kind: 'join',
  config: { mode: 'all', inputs: 2 },
};

const verifyNode: WorkflowNode = {
  id: 'n5',
  label: 'Verify',
  x: 900,
  y: 0,
  kind: 'verify',
  config: { check: 'exit-code', command: 'exit 0', env: {} },
};

function mount(graph: WorkflowGraph) {
  return render(<WorkflowCanvas graph={graph} resetKey="w1" onChange={() => {}} />);
}

describe('WorkflowNodeView — port handles', () => {
  it('renders one handle per portsForNode() entry, coloured by its own port type', () => {
    const { container } = mount({ nodes: [httpNode], edges: [] });
    // http: in (any), out (json — pinned by no outputShape default -> 'json' via dataOutPort), error (json).
    const handles = container.querySelectorAll('[data-nodeid="n1"]');
    expect(handles).toHaveLength(3);

    const inHandle = container.querySelector('[data-nodeid="n1"][data-handleid="in"]') as HTMLElement;
    const outHandle = container.querySelector('[data-nodeid="n1"][data-handleid="out"]') as HTMLElement;
    const errorHandle = container.querySelector('[data-nodeid="n1"][data-handleid="error"]') as HTMLElement;
    expect(inHandle).toBeTruthy();
    expect(outHandle).toBeTruthy();
    expect(errorHandle).toBeTruthy();
    // error ports are always `json` (`errorPort()` in shared/src/workflow.ts).
    expect(errorHandle.style.backgroundColor).toBe('hsl(var(--port-json))');
  });

  it('gives a condition node its true/false/error out-ports plus one in-port', () => {
    const { container } = mount({ nodes: [conditionNode], edges: [] });
    expect(container.querySelectorAll('[data-nodeid="n2"][data-handlepos="left"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-nodeid="n2"][data-handlepos="right"]')).toHaveLength(3);
    expect(container.querySelector('[data-nodeid="n2"][data-handleid="true"]')).toBeTruthy();
    expect(container.querySelector('[data-nodeid="n2"][data-handleid="false"]')).toBeTruthy();
  });

  it('gives a 2-input join node two distinct in-ports', () => {
    const { container } = mount({ nodes: [joinNode], edges: [] });
    expect(container.querySelector('[data-nodeid="n3"][data-handleid="in-1"]')).toBeTruthy();
    expect(container.querySelector('[data-nodeid="n3"][data-handleid="in-2"]')).toBeTruthy();
  });

  it('never renders a handle for a note — canvas furniture with no executor and no ports', () => {
    const noteNode: WorkflowNode = { id: 'n4', label: 'Note', x: 0, y: 0, kind: 'note', config: { text: '' } };
    const { container } = mount({ nodes: [noteNode], edges: [] });
    expect(container.querySelectorAll('[data-nodeid="n4"]')).toHaveLength(0);
  });
});

describe('WorkflowNodeView — node shape', () => {
  it('gives condition a diamond-accented header and everything else the plain card corner radius', () => {
    const { container } = mount({ nodes: [httpNode, conditionNode], edges: [] });
    const httpCard = container.querySelector('[data-node-id="n1"]') as HTMLElement;
    const conditionCard = container.querySelector('[data-node-id="n2"]') as HTMLElement;
    expect(httpCard.className).toContain('rounded-lg');
    expect(conditionCard.className).toContain('rounded-lg');
    // The diamond marker sits inside condition's header row only.
    expect(conditionCard.querySelector('.rotate-45')).toBeTruthy();
    expect(httpCard.querySelector('.rotate-45')).toBeFalsy();
  });

  it('renders a join node as a fully-rounded pill, not the header/body card layout', () => {
    const { container } = mount({ nodes: [joinNode], edges: [] });
    const joinCard = container.querySelector('[data-node-id="n3"]') as HTMLElement;
    expect(joinCard.className).toContain('rounded-full');
  });
});

describe('WorkflowNodeView — check-badge (verify, Theme E)', () => {
  it('shows no pass/fail badge before any run has settled it', () => {
    const { container } = mount({ nodes: [verifyNode], edges: [] });
    const card = container.querySelector('[data-node-id="n5"]') as HTMLElement;
    expect(card.textContent).not.toContain('pass');
    expect(card.textContent).not.toContain('fail');
  });

  it("shows the node's own pass/fail verdict — its generic status is always `succeeded` either way", () => {
    const { container } = render(
      <WorkflowCanvas
        graph={{ nodes: [verifyNode], edges: [] }}
        resetKey="w1"
        onChange={() => {}}
        nodeStatuses={new Map<string, WorkflowNodeStatus>([['n5', 'succeeded']])}
        nodeSettledPorts={new Map([['n5', 'fail']])}
      />,
    );
    const card = container.querySelector('[data-node-id="n5"]') as HTMLElement;
    expect(card.textContent).toContain('fail');
  });
});
