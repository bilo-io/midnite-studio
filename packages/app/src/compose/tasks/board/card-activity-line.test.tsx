import { cleanup, render, screen } from '../../../../test-support/tasks-render';
import { afterEach, describe, expect, it } from 'vitest';

import { CardActivityLine } from '@midnite/studio-feature-tasks/renderer/testing';

afterEach(cleanup);

describe('CardActivityLine', () => {
  it('reads "Thinking…" for a thinking session', () => {
    render(<CardActivityLine activity="thinking" />);
    expect(screen.getByText('Thinking…')).toBeDefined();
  });

  it('reads "Waiting for input" for a waiting session', () => {
    render(<CardActivityLine activity="waiting" />);
    expect(screen.getByText('Waiting for input')).toBeDefined();
  });

  it('reads "Running" for idle and for an unspoken detector alike', () => {
    render(<CardActivityLine activity="idle" />);
    expect(screen.getByText('Running')).toBeDefined();
    cleanup();
    render(<CardActivityLine activity={undefined} />);
    expect(screen.getByText('Running')).toBeDefined();
  });
});
