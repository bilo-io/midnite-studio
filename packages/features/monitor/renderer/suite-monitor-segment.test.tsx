// vitest/jsdom: the segment is a React component over a hand-off — no real browser capability needed.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMetricsStore } from '@midnite/studio-frame';

import { createSuiteMonitorSegment } from './suite-monitor-segment';

afterEach(() => {
  cleanup();
  useMetricsStore.setState({ latest: null });
});

describe('createSuiteMonitorSegment', () => {
  it('renders nothing before the first sample', () => {
    const Segment = createSuiteMonitorSegment({ hosted: new Set() });
    const { container } = render(<Segment />);
    expect(container.querySelector('[data-testid="monitor-cluster"]')).toBeNull();
  });

  it('is a component, not an element', () => {
    expect(createSuiteMonitorSegment({ hosted: new Set(['monitor']), navigate: vi.fn() })).toBeTypeOf('function');
  });
});
