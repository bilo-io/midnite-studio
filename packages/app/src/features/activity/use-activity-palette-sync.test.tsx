import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useActivityPaletteStore } from './activity-palette-store';
import { useActivityPaletteSync } from './use-activity-palette-sync';

function Harness() {
  useActivityPaletteSync();
  return null;
}

describe('useActivityPaletteSync', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = '';
    useActivityPaletteStore.setState({ activePaletteId: 'brand' });
  });

  afterEach(() => {
    document.documentElement.style.cssText = '';
  });

  it('writes the Brand preset tokens to :root on mount', () => {
    render(<Harness />);
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--activity-waiting')).toBe('#f59e0b');
    expect(root.getPropertyValue('--activity-agent-ramp')).toBe(
      'hsl(220 90% 55%), hsl(263 70% 55%), hsl(347 75% 55%), hsl(220 90% 55%)',
    );
  });

  it('re-resolves when the active preset id changes', () => {
    render(<Harness />);
    act(() => {
      useActivityPaletteStore.getState().setActivePaletteId('rainbow');
    });
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--activity-agent-ramp')).toBe(
      '#f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #ec4899, #f43f5e',
    );
  });

  it('falls back to Brand for an unknown preset id rather than leaving stale tokens', () => {
    render(<Harness />);
    act(() => {
      useActivityPaletteStore.getState().setActivePaletteId('does-not-exist');
    });
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--activity-agent-ramp')).toBe(
      'hsl(220 90% 55%), hsl(263 70% 55%), hsl(347 75% 55%), hsl(220 90% 55%)',
    );
  });
});
