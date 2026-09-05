import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './error-boundary';
import { reportError } from '../lib/report';

/**
 * The boundary's four contracts: it catches, it reports, it can be retried,
 * and a `resetKey` change clears it.
 *
 * `lib/report` is mocked rather than exercised — Phase 65 owns what
 * `reportError` does with a report, and a real one here would reach for a
 * bridge jsdom has none of. What this file asserts is only the seam: that
 * `componentDidCatch` calls it with `'boundary'` and React's component stack.
 */
vi.mock('../lib/report', () => ({ reportError: vi.fn() }));

const reported = vi.mocked(reportError);

/**
 * React writes every boundary-caught error to `console.error` itself, from
 * inside its own `onCaughtError`. Silenced so the suite's output stays
 * readable — the four expected throws below are the point of the file, not a
 * regression.
 */
let consoleError: ReturnType<typeof vi.spyOn>;

/**
 * Throws while its fuse is armed — and the fuse is disarmed by the TEST, never
 * by the component itself.
 *
 * A child that self-disarms on its first render looks like the obvious way to
 * write "throws once, then succeeds", and it does not work: React retries a
 * failed concurrent render synchronously, the second attempt finds the fuse
 * already spent, and the render simply succeeds — the boundary never catches
 * anything and the test asserts against a tree that never broke.
 */
function ThrowWhileArmed({ fuse }: { fuse: { armed: boolean } }) {
  if (fuse.armed) throw new Error('boom');
  return <p>recovered</p>;
}

function AlwaysThrows(): never {
  throw new Error('a very persistent failure');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    reported.mockClear();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    consoleError.mockRestore();
  });

  it('renders the fallback instead of letting the throw escape', () => {
    render(
      <ErrorBoundary label="Graph">
        <AlwaysThrows />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Graph stopped rendering')).toBeTruthy();
    // The message is the body, so the card says what failed and not merely that
    // something did.
    expect(screen.getByText('a very persistent failure')).toBeTruthy();
  });

  it('falls back to a generic title when it has no label', () => {
    render(
      <ErrorBoundary>
        <AlwaysThrows />
      </ErrorBoundary>,
    );

    expect(screen.getByText('This view stopped rendering')).toBeTruthy();
  });

  it('reports to lib/report as a boundary, with the component stack', () => {
    render(
      <ErrorBoundary label="Graph">
        <AlwaysThrows />
      </ErrorBoundary>,
    );

    expect(reported).toHaveBeenCalled();
    const call = reported.mock.calls[0];
    expect(call?.[0]).toBe('boundary');
    expect((call?.[1] as Error).message).toBe('a very persistent failure');
    expect(typeof call?.[2]?.componentStack).toBe('string');
    expect(call?.[2]?.componentStack).toContain('AlwaysThrows');
  });

  it('renders nothing at all when silent — the optional-modal case', () => {
    const { container } = render(
      <ErrorBoundary label="Slides" silent>
        <AlwaysThrows />
      </ErrorBoundary>,
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.textContent).toBe('');
    // Silent is about the CARD, not about the report: a modal that quietly
    // never appeared is still a failure someone needs to know happened.
    expect(reported).toHaveBeenCalled();
  });

  it('Try again re-mounts the child', () => {
    const fuse = { armed: true };
    render(
      <ErrorBoundary label="Graph">
        <ThrowWhileArmed fuse={fuse} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Graph stopped rendering')).toBeTruthy();

    // Whatever was wrong is no longer wrong — the case Try again exists for.
    fuse.armed = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('recovered')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a resetKey change clears the caught error', () => {
    const fuse = { armed: true };
    const { rerender } = render(
      <ErrorBoundary label="Graph" resetKey="graph">
        <ThrowWhileArmed fuse={fuse} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Graph stopped rendering')).toBeTruthy();

    // What navigating away from a broken view and back does: same boundary,
    // different key, fresh attempt — no window reload.
    fuse.armed = false;
    rerender(
      <ErrorBoundary label="Graph" resetKey="history">
        <ThrowWhileArmed fuse={fuse} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('recovered')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves the error alone when resetKey is unchanged', () => {
    const fuse = { armed: true };
    const { rerender } = render(
      <ErrorBoundary label="Graph" resetKey="graph">
        <ThrowWhileArmed fuse={fuse} />
      </ErrorBoundary>,
    );

    fuse.armed = false;
    rerender(
      <ErrorBoundary label="Graph" resetKey="graph">
        <ThrowWhileArmed fuse={fuse} />
      </ErrorBoundary>,
    );

    // Still the card: a re-render is not a reset. Only a resetKey change or the
    // button is.
    expect(screen.getByText('Graph stopped rendering')).toBeTruthy();
  });

  it('window.__mstudioTestThrow trips the boundary with the matching label', () => {
    render(
      <ErrorBoundary label="Graph">
        <p>content</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('content')).toBeTruthy();

    // The e2e hook, exercised here so its absence from a production build is
    // the only thing `error-boundary.spec.ts` has to trust.
    expect(typeof window.__mstudioTestThrow).toBe('function');
    act(() => {
      window.__mstudioTestThrow?.('Graph', 'forced');
    });

    expect(screen.getByText('Graph stopped rendering')).toBeTruthy();
    expect(screen.getByText('forced')).toBeTruthy();
  });
});
