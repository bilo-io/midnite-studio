import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

export type SecretMaskedValueHandle = {
  reveal(secretText: string): void;
  mask(): void;
  isRevealed(): boolean;
};

export type SecretMaskedValueProps = {
  /** Optional callback fired when the secret is automatically or manually masked. */
  onMask?: () => void;
  /** Optional timeout in seconds before auto-masking (defaults to 30s). */
  timeoutSeconds?: number;
  className?: string;
  ariaLabel?: string;
};

const MASK_PLACEHOLDER = '••••••••••••••••';

/**
 * Renders a revealed secret value without storing it in React props, state, or persistent storage.
 *
 * Requirements (Phase 118 Theme C):
 * - Plaintext is held strictly in a mutable `useRef` and rendered directly to a DOM text node.
 * - Automatically masks after 30 seconds or when the window loses focus (`blur` event).
 * - Excluded from every persisted store.
 * - Zero console logging.
 */
export const SecretMaskedValue = forwardRef<SecretMaskedValueHandle, SecretMaskedValueProps>(
  function SecretMaskedValue({ onMask, timeoutSeconds = 30, className = '', ariaLabel = 'Secret value' }, ref) {
    const textRef = useRef<HTMLSpanElement | null>(null);
    const valueRef = useRef<string | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const [revealed, setRevealed] = useState(false);

    const mask = useCallback(() => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      valueRef.current = null;
      if (textRef.current) {
        textRef.current.textContent = MASK_PLACEHOLDER;
      }
      setRevealed(false);
      onMask?.();
    }, [onMask]);

    const reveal = useCallback(
      (secretText: string) => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        valueRef.current = secretText;
        if (textRef.current) {
          textRef.current.textContent = secretText;
        }
        setRevealed(true);

        timerRef.current = setTimeout(() => {
          mask();
        }, Math.max(1, timeoutSeconds) * 1000);
      },
      [mask, timeoutSeconds],
    );

    useImperativeHandle(
      ref,
      () => ({
        reveal,
        mask,
        isRevealed: () => revealed,
      }),
      [reveal, mask, revealed],
    );

    useEffect(() => {
      if (!revealed) return;

      const handleBlur = () => {
        mask();
      };

      window.addEventListener('blur', handleBlur);
      return () => {
        window.removeEventListener('blur', handleBlur);
      };
    }, [revealed, mask]);

    useEffect(() => {
      return () => {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        valueRef.current = null;
      };
    }, []);

    return (
      <span
        ref={textRef}
        role="region"
        aria-label={ariaLabel}
        data-revealed={revealed ? 'true' : 'false'}
        className={`font-mono select-all ${className}`}
      >
        {MASK_PLACEHOLDER}
      </span>
    );
  },
);
