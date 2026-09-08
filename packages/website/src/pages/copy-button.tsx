import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuCopy } from 'react-icons/lu';

export type CopyButtonProps = {
  /** The exact text to put on the clipboard. */
  value: string;
  /** Names what is being copied, for assistive tech. */
  label: string;
  className?: string;
};

/** How long the "Copied" state stays up. */
const CONFIRM_MS = 1800;

type State = 'idle' | 'copied' | 'failed';

/**
 * Copies one string, and says whether it worked.
 *
 * `navigator.clipboard.writeText` is a promise that **rejects** — on an
 * insecure origin, in a browser that gates it behind a permission the visitor
 * declined, or in any context without transient activation. A copy button that
 * says "Copied" regardless is worse than no button at all, because the visitor
 * pastes nothing and does not know why. So the failure has its own visible
 * state that tells them to select the command instead, and the command sits in
 * a real `<code>` block they can select either way.
 *
 * The timer is cleared on unmount and before each new one, so a double click
 * cannot leave a stale callback to reset a state it did not set.
 */
export const CopyButton = ({ value, label, className = '' }: CopyButtonProps) => {
  const [state, setState] = useState<State>('idle');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    timer.current = window.setTimeout(() => setState('idle'), CONFIRM_MS);
  };

  const text = state === 'copied' ? 'Copied' : state === 'failed' ? 'Select it instead' : 'Copy';

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="copy-button"
      aria-label={`Copy ${label}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-bg-elevated px-2.5 py-1.5 text-xs font-medium text-fg-muted transition duration-fast hover:border-accent hover:text-accent ${className}`}
    >
      <span aria-hidden="true">{state === 'copied' ? <LuCheck /> : <LuCopy />}</span>
      {text}
      {/* Announced once per change, rather than leaving the label to be re-read. */}
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'copied' ? `${label} copied` : state === 'failed' ? 'Copy failed' : ''}
      </span>
    </button>
  );
};
