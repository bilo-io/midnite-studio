import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SETTINGS_PAGE_ICON } from '../nav-icons';
import { stepPath, WorkflowsIcon } from './workflows-icon';

afterEach(cleanup);

describe('WorkflowsIcon', () => {
  it('is the Workflows mark on its settings page (the rail Graphs entry wears the former graph glyph)', () => {
    expect(SETTINGS_PAGE_ICON.workflows).toBe(WorkflowsIcon);
  });

  it('draws four steps and six nodes, the top-right step and its nodes in the accent', () => {
    const { container } = render(<WorkflowsIcon className="h-4 w-4" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('class')).toBe('h-4 w-4');

    expect(svg.querySelectorAll('path[data-step]')).toHaveLength(4);
    expect(svg.querySelectorAll('path[data-accent]')).toHaveLength(1);

    const nodes = svg.querySelectorAll(':scope > circle');
    expect(nodes).toHaveLength(6);
    const accented = [...nodes].filter((n) => n.getAttribute('fill')?.includes('--workflows-icon-accent'));
    expect(accented).toHaveLength(2);
  });

  it('renders identically every time — no per-instance ids', () => {
    const a = render(<WorkflowsIcon />).container.innerHTML;
    cleanup();
    const b = render(<WorkflowsIcon />).container.innerHTML;
    expect(a).toBe(b);
  });
});

describe('stepPath', () => {
  it('closes a step with no gaps', () => {
    expect(stepPath(2, 2, [])).toMatch(/Z$/);
  });

  it('breaks the path once per gap and never closes it', () => {
    const oneGap = stepPath(2, 2, ['right']);
    expect(oneGap).not.toMatch(/Z$/);
    expect(oneGap.match(/M /g)).toHaveLength(1);
    // Starts just past the right-edge gap (y 6 + 2) and ends just before it.
    expect(oneGap.startsWith('M 10 8 ')).toBe(true);
    expect(oneGap.endsWith('L 10 4')).toBe(true);

    expect(stepPath(14, 2, ['left', 'bottom']).match(/M /g)).toHaveLength(2);
  });
});
