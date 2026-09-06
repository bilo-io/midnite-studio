import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TranscriptView } from './transcript-view';

/** jsdom has no `ResizeObserver` — a minimal stub, per `use-browser-bounds.test.tsx`. */
class StubResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', StubResizeObserver);

/**
 * A fake `@xterm/xterm` `Terminal` — real xterm needs a canvas jsdom does not
 * provide, and the phase's own acceptance criteria (a payload written exactly
 * once, a disposed instance on row switch, a swallowed keystroke) are about
 * THIS component's call discipline, not about xterm's own rendering.
 *
 * `vi.hoisted`, because `vi.mock`'s factory is itself hoisted above every
 * top-level statement in this file — `instances` and the class have to exist
 * before that hoist runs.
 */
type KeyEvent = { type: string; key: string; metaKey?: boolean; ctrlKey?: boolean };

const { instances, FakeTerminal } = vi.hoisted(() => {
  class FakeTerminal {
    written: unknown[] = [];
    disposed = false;
    keyHandler: ((event: KeyEvent) => boolean) | null = null;
    constructor(public options: Record<string, unknown>) {
      instances.push(this);
    }
    open() {}
    loadAddon() {}
    write(data: unknown) {
      this.written.push(data);
    }
    attachCustomKeyEventHandler(handler: (event: KeyEvent) => boolean) {
      this.keyHandler = handler;
    }
    dispose() {
      this.disposed = true;
    }
  }
  const instances: InstanceType<typeof FakeTerminal>[] = [];
  return { instances, FakeTerminal };
});

vi.mock('@xterm/xterm', () => ({ Terminal: FakeTerminal }));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock('../themes/resolve-palette', () => ({
  resolveTerminalPalette: () => ({ terminal: {} }),
}));

const transcript = vi.fn();
vi.mock('../../services/bridge', () => ({
  bridge: () => ({ sessions: { transcript } }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  instances.length = 0;
});

const bytesOf = (n: number): Uint8Array => new Uint8Array(n).fill(65);

describe('TranscriptView', () => {
  it('writes a 1 MB payload exactly once', async () => {
    const payload = bytesOf(1024 * 1024);
    transcript.mockResolvedValue({ bytes: payload });

    await act(async () => {
      render(<TranscriptView sessionId="s1" />);
    });

    expect(instances).toHaveLength(1);
    expect(instances[0]?.written[0]).toBe(payload);
    // Exactly one data write plus the RESET_MODES write — never a doubling.
    expect(instances[0]?.written).toHaveLength(2);
  });

  it('disposes the previous Terminal when the selected session changes', async () => {
    transcript.mockResolvedValueOnce({ bytes: bytesOf(10) });
    const { rerender } = render(<TranscriptView sessionId="s1" />);
    await act(async () => {});

    expect(instances).toHaveLength(1);
    const first = instances[0]!;
    expect(first.disposed).toBe(false);

    transcript.mockResolvedValueOnce({ bytes: bytesOf(10) });
    rerender(<TranscriptView sessionId="s2" />);
    await act(async () => {});

    expect(first.disposed).toBe(true);
    expect(instances).toHaveLength(2);
  });

  it('renders EmptyState rather than a blank rectangle for a zero-length transcript', async () => {
    transcript.mockResolvedValue({ bytes: new Uint8Array() });

    await act(async () => {
      render(<TranscriptView sessionId="s1" />);
    });

    expect(screen.getByText('No transcript')).toBeTruthy();
    expect(instances).toHaveLength(0);
  });

  it('swallows a keystroke rather than letting it reach the emulator', async () => {
    transcript.mockResolvedValue({ bytes: bytesOf(10) });

    await act(async () => {
      render(<TranscriptView sessionId="s1" />);
    });

    const term = instances[0]!;
    expect(term.keyHandler).toBeTruthy();
    // A plain letter key: swallowed.
    expect(term.keyHandler?.({ type: 'keydown', key: 'x' })).toBe(false);
    // Copy and select-all stay live.
    expect(term.keyHandler?.({ type: 'keydown', key: 'c', metaKey: true })).toBe(true);
    expect(term.keyHandler?.({ type: 'keydown', key: 'a', metaKey: true })).toBe(true);
  });
});
