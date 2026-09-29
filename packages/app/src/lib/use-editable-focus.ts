import { useEffect, useState } from 'react';

/**
 * Whether `target` takes typed text: an `<input>`, `<textarea>`, `<select>` or
 * anything `contenteditable`. xterm's own input is a hidden `<textarea>`
 * (`.xterm-helper-textarea`) and Monaco's is too, so a focused terminal or
 * code editor reads as editable here without either being named.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Tracks whether keyboard focus is currently inside something you type into
 * (see {@link isEditableTarget}), anywhere in the document.
 *
 * For a `useDismiss` registration that must stand down while the user types:
 * the dismissal stack consumes every Escape it is handed, so the only way for
 * a passive surface to leave an Escape to a focused field is to not be
 * registered while that field has focus.
 */
export function useEditableFocus(): boolean {
  const [editable, setEditable] = useState(() =>
    typeof document === 'undefined' ? false : isEditableTarget(document.activeElement),
  );

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => setEditable(isEditableTarget(event.target));
    // `relatedTarget` is where focus is going; null (focus leaving to the
    // body, or out of the window) is "not editable".
    const onFocusOut = (event: FocusEvent) => setEditable(isEditableTarget(event.relatedTarget));
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return editable;
}
