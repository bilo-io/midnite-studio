import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useFocusTrap } from './use-focus-trap';

describe('useFocusTrap', () => {
  it('attaches keydown listener and gives focus to container when active', () => {
    const container = document.createElement('div');
    container.tabIndex = -1;
    const btn1 = document.createElement('button');
    const btn2 = document.createElement('button');
    container.appendChild(btn1);
    container.appendChild(btn2);
    document.body.appendChild(container);

    const ref = { current: container };
    renderHook(() => useFocusTrap(ref, true));

    expect(document.activeElement).toBe(container);

    // Press Tab on last element -> wraps to first
    btn2.focus();
    expect(document.activeElement).toBe(btn2);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    container.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(btn1);

    // Press Shift+Tab on first element -> wraps to last
    btn1.focus();
    const shiftTabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    container.dispatchEvent(shiftTabEvent);
    expect(document.activeElement).toBe(btn2);

    document.body.removeChild(container);
  });
});
