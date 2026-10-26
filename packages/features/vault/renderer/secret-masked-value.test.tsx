// vitest/jsdom: component DOM text, window blur, and timer masking.
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SecretMaskedValue, type SecretMaskedValueHandle } from './secret-masked-value';

describe('SecretMaskedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders masked bullets initially without plaintext', () => {
    const ref = createRef<SecretMaskedValueHandle>();
    render(<SecretMaskedValue ref={ref} ariaLabel="API secret" />);

    const el = screen.getByRole('region', { name: 'API secret' });
    expect(el.textContent).toBe('••••••••••••••••');
    expect(el.getAttribute('data-revealed')).toBe('false');
    expect(ref.current?.isRevealed()).toBe(false);
  });

  it('reveals plaintext directly into DOM text node via imperative handle', () => {
    const ref = createRef<SecretMaskedValueHandle>();
    render(<SecretMaskedValue ref={ref} ariaLabel="API secret" />);

    const el = screen.getByRole('region', { name: 'API secret' });
    act(() => {
      ref.current?.reveal('sk-test-secret-value-12345');
    });

    expect(el.textContent).toBe('sk-test-secret-value-12345');
    expect(el.getAttribute('data-revealed')).toBe('true');
    expect(ref.current?.isRevealed()).toBe(true);
  });

  it('auto-masks back to bullets after timeout (default 30 seconds)', () => {
    const ref = createRef<SecretMaskedValueHandle>();
    const onMask = vi.fn();
    render(<SecretMaskedValue ref={ref} onMask={onMask} ariaLabel="API secret" />);

    const el = screen.getByRole('region', { name: 'API secret' });
    act(() => {
      ref.current?.reveal('secret-to-be-masked');
    });
    expect(el.textContent).toBe('secret-to-be-masked');

    // Advance 29 seconds: still revealed
    act(() => {
      vi.advanceTimersByTime(29_000);
    });
    expect(el.textContent).toBe('secret-to-be-masked');
    expect(onMask).not.toHaveBeenCalled();

    // Advance 2 seconds (31s total): masked
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(el.textContent).toBe('••••••••••••••••');
    expect(el.getAttribute('data-revealed')).toBe('false');
    expect(onMask).toHaveBeenCalledTimes(1);
    expect(ref.current?.isRevealed()).toBe(false);
  });

  it('immediately masks back to bullets on window blur', () => {
    const ref = createRef<SecretMaskedValueHandle>();
    const onMask = vi.fn();
    render(<SecretMaskedValue ref={ref} onMask={onMask} ariaLabel="API secret" />);

    const el = screen.getByRole('region', { name: 'API secret' });
    act(() => {
      ref.current?.reveal('blur-sensitive-secret');
    });
    expect(el.textContent).toBe('blur-sensitive-secret');

    // Simulate window blur event
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(el.textContent).toBe('••••••••••••••••');
    expect(el.getAttribute('data-revealed')).toBe('false');
    expect(onMask).toHaveBeenCalledTimes(1);
  });

  it('masks immediately when mask() is called imperatively', () => {
    const ref = createRef<SecretMaskedValueHandle>();
    render(<SecretMaskedValue ref={ref} ariaLabel="API secret" />);

    const el = screen.getByRole('region', { name: 'API secret' });
    act(() => {
      ref.current?.reveal('my-secret');
    });
    expect(el.textContent).toBe('my-secret');

    act(() => {
      ref.current?.mask();
    });
    expect(el.textContent).toBe('••••••••••••••••');
  });
});
