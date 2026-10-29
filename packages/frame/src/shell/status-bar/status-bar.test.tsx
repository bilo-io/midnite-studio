// vitest/jsdom: the frame's status bar as a non-Studio app composes it — the suite segments and nothing of Studio's.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StatusBar } from './status-bar';
import { suiteSegments, type AppPanels } from './suite-segments';

afterEach(cleanup);

const seg = (id: string) =>
  function Segment() {
    return <span data-testid={`seg-${id}`}>{id}</span>;
  };

const ALL: AppPanels = {
  terminal: seg('terminal'),
  palette: seg('palette'),
  monitor: seg('monitor'),
  notifications: seg('notifications'),
  assistant: seg('assistant'),
};

describe('StatusBar under suiteSegments', () => {
  it('renders exactly the five suite segments in a non-Studio app', () => {
    render(<StatusBar segments={suiteSegments(ALL)} />);
    expect(screen.getAllByTestId(/^seg-/).map((el) => el.textContent)).toEqual([
      'terminal',
      'palette',
      'monitor',
      'notifications',
      'assistant',
    ]);
  });

  it('draws the fab at the right end when given one', () => {
    render(<StatusBar segments={suiteSegments({ terminal: ALL.terminal })} fab={<button type="button">fab</button>} />);
    expect(screen.getByTestId('status-bar-fab').textContent).toBe('fab');
    expect(screen.getAllByTestId(/^seg-/)).toHaveLength(1);
  });
});
