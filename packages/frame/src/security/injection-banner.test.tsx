import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InjectionBanner } from './injection-banner';
import { useInjectionScans } from './use-injection-scans';

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

const scan = { score: 0.9, threshold: 0.5, flagged: true, signals: [{ id: 'unicode-tag-characters', weight: 0.9 }], stripped: 'clean' };

describe('InjectionBanner', () => {
  it('names the signals and offers proceed, strip and drop', () => {
    const [onProceed, onStrip, onDrop] = [vi.fn(), vi.fn(), vi.fn()];
    render(<InjectionBanner subject="notes.md" scan={scan} onProceed={onProceed} onStrip={onStrip} onDrop={onDrop} />);
    expect(screen.getByRole('alert').textContent).toContain('notes.md');
    expect(screen.getByRole('alert').textContent).toContain('invisible Unicode tag characters');
    fireEvent.click(screen.getByText('Proceed'));
    fireEvent.click(screen.getByText('Strip flagged runs'));
    fireEvent.click(screen.getByText('Drop'));
    expect([onProceed, onStrip, onDrop].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });
});

describe('useInjectionScans', () => {
  it('keeps only flagged items, scans each text once, and forgets removed items', async () => {
    const scanContent = vi.fn(async ({ text }: { text: string }) => (text === 'bad' ? scan : { score: 0, threshold: 0.5, flagged: false, signals: [] }));
    (window as unknown as { midniteStudio: unknown }).midniteStudio = { security: { scanContent } };
    const { result, rerender } = renderHook(({ items }) => useInjectionScans(items), {
      initialProps: { items: [{ id: 'a', text: 'bad' }, { id: 'b', text: 'fine' }] },
    });
    await waitFor(() => expect(Object.keys(result.current)).toEqual(['a']));
    rerender({ items: [{ id: 'a', text: 'bad' }, { id: 'b', text: 'fine' }] });
    expect(scanContent).toHaveBeenCalledTimes(2);
    rerender({ items: [{ id: 'b', text: 'fine' }] });
    await waitFor(() => expect(result.current).toEqual({}));
  });

  it('reads as nothing flagged with no bridge', () => {
    const { result } = renderHook(() => useInjectionScans([{ id: 'a', text: 'bad' }]));
    expect(result.current).toEqual({});
  });
});
