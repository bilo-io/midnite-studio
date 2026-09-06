import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StateDot, type DotState } from './state-dot';

afterEach(cleanup);

/**
 * `exited` (Phase 67 Theme C) has to read as visually distinct from `idle`
 * and `unavailable` — both of which fall through to the same fallback dot —
 * so this asserts the actual rendered class rather than eyeballing it.
 */
describe('StateDot', () => {
  it('renders exited as a hollow ring, not the idle/unavailable fill', () => {
    const { container: exited } = render(<StateDot state="exited" />);
    const { container: idle } = render(<StateDot state="idle" />);

    const exitedSpan = exited.querySelector('span');
    const idleSpan = idle.querySelector('span');

    expect(exitedSpan?.className).not.toBe(idleSpan?.className);
    expect(exitedSpan?.className).toContain('border');
    expect(exitedSpan?.className).not.toContain('bg-muted-foreground');
  });

  it('gives idle and unavailable the identical fallback dot', () => {
    const { container: idle } = render(<StateDot state="idle" />);
    const { container: unavailable } = render(<StateDot state="unavailable" />);
    expect(idle.querySelector('span')?.className).toBe(
      unavailable.querySelector('span')?.className,
    );
  });

  it('keeps exited distinct from asleep too', () => {
    const { container: exited } = render(<StateDot state="exited" />);
    const { container: asleep } = render(<StateDot state="asleep" />);
    expect(exited.querySelector('span')?.className).not.toBe(
      asleep.querySelector('span')?.className,
    );
  });

  it('every DotState renders exactly one span with no crash', () => {
    const states: DotState[] = ['idle', 'starting', 'open', 'exited', 'unavailable', 'asleep'];
    for (const state of states) {
      const { container } = render(<StateDot state={state} />);
      expect(container.querySelectorAll('span').length).toBe(1);
      cleanup();
    }
  });
});
