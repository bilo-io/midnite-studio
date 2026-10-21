import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { isEditableTarget, useEditableFocus } from './use-editable-focus';

afterEach(() => cleanup());

describe('isEditableTarget', () => {
  it('is true for text-taking elements and false for everything else', () => {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(editable, 'isContentEditable', { value: true });
    for (const el of [document.createElement('input'), document.createElement('textarea'), document.createElement('select'), editable]) {
      expect(isEditableTarget(el)).toBe(true);
    }
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});

describe('useEditableFocus', () => {
  it('follows focus into and out of an input', () => {
    const { getByRole } = render(
      <>
        <input aria-label="field" />
        <button type="button">plain</button>
      </>,
    );
    const { result } = renderHook(() => useEditableFocus());
    expect(result.current).toBe(false);
    act(() => (getByRole('textbox') as HTMLInputElement).focus());
    expect(result.current).toBe(true);
    act(() => getByRole('button').focus());
    expect(result.current).toBe(false);
  });
});
