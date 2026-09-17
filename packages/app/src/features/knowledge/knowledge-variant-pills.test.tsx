// Layer: vitest/jsdom — DOM text/role/aria-pressed assertions, no canvas
// involved (the pills are plain buttons; sigma is behind a separate,
// un-unit-testable-under-jsdom seam).
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeVariantPills } from './knowledge-variant-pills';

afterEach(cleanup);

/**
 * jsdom never lays out real pixels, so `useOverflowVariants`'s width
 * measurement (real `knowledge-canvas.spec.ts` coverage: Playwright, a real
 * viewport) collapses every one of Theme D's four pills into the overflow
 * menu here — never observable with Theme A's original one-pill bar, which
 * is why the original version of this test never had to reach past the
 * bar. This helper reaches through whichever surface currently holds a
 * variant, matching the component's own contract: "every variant
 * keyboard-reachable whether it is on the bar or in the menu."
 */
function findVariantControl(name: RegExp): { element: HTMLElement; pressedAttr: 'aria-pressed' | 'aria-checked' } {
  const bar = screen.queryByRole('button', { name });
  if (bar) return { element: bar, pressedAttr: 'aria-pressed' };
  const trigger = screen.getByRole('button', { name: 'More renderers' });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  return { element: screen.getByRole('menuitemradio', { name }), pressedAttr: 'aria-checked' };
}

describe('KnowledgeVariantPills', () => {
  it('renders one control per registered variant — Theme D’s four sigma looks', () => {
    render(<KnowledgeVariantPills activeId="atlas" onSelect={vi.fn()} />);
    for (const name of [/^atlas$/i, /^constellation$/i, /^orbit$/i, /^clusters$/i]) {
      expect(findVariantControl(name).element).toBeTruthy();
    }
  });

  it('marks the active variant pressed/checked and the rest not', () => {
    render(<KnowledgeVariantPills activeId="atlas" onSelect={vi.fn()} />);
    const active = findVariantControl(/^atlas$/i);
    expect(active.element.getAttribute(active.pressedAttr)).toBe('true');
    const inactive = findVariantControl(/^constellation$/i);
    expect(inactive.element.getAttribute(inactive.pressedAttr)).toBe('false');
  });

  it('calls onSelect with the clicked variant id', () => {
    const onSelect = vi.fn();
    render(<KnowledgeVariantPills activeId="atlas" onSelect={onSelect} />);
    fireEvent.click(findVariantControl(/^constellation$/i).element);
    expect(onSelect).toHaveBeenCalledWith('constellation');
  });
});
