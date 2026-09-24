import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WandField } from './wand-field';

const improveFieldFn = vi.fn();

vi.mock('../services/bridge', () => ({
  bridge: () => ({ ai: { improveField: improveFieldFn } }),
  hasBridge: () => true,
}));

afterEach(() => {
  cleanup();
  improveFieldFn.mockReset();
});

/** A tiny controlled wrapper — `WandField` is stateless about its own value. */
function Harness({ initial = 'x' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <WandField
      fieldName="body"
      value={value}
      onChange={setValue}
      repoName="bilo-io/midnite-studio"
      inputProps={{ 'aria-label': 'body' }}
    />
  );
}

function renderField(initial?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Harness {...(initial !== undefined ? { initial } : {})} />
    </QueryClientProvider>,
  );
}

function fieldValue(): string {
  return (screen.getByLabelText('body') as HTMLInputElement).value;
}

describe('WandField', () => {
  it('replaces the value with the CLI reply on success', async () => {
    improveFieldFn.mockResolvedValue({ ok: true, value: { text: 'A better body.' } });
    renderField('the old body');

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite body with AI' }));

    await waitFor(() => expect(fieldValue()).toBe('A better body.'));
    expect(improveFieldFn).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: 'body', fieldValue: 'the old body' }),
    );
  });

  it('undoes back to the previous value', async () => {
    improveFieldFn.mockResolvedValue({ ok: true, value: { text: 'A better body.' } });
    renderField('the old body');

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite body with AI' }));
    await waitFor(() => expect(fieldValue()).toBe('A better body.'));

    fireEvent.click(screen.getByRole('button', { name: 'Undo the rewrite' }));
    expect(fieldValue()).toBe('the old body');
  });

  it('shows the envelope message on a refusal, and leaves the value alone', async () => {
    improveFieldFn.mockResolvedValue({
      ok: false,
      kind: 'error',
      message: 'No agent CLI with a headless mode is installed, so the wand has nothing to run.',
    });
    renderField('unchanged');

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite body with AI' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('No agent CLI with a headless mode'),
    );
    expect(fieldValue()).toBe('unchanged');
  });

  it('discards a late reply once the field has been re-enabled', async () => {
    let resolve: (value: unknown) => void = () => {};
    improveFieldFn.mockReturnValue(new Promise((r) => (resolve = r)));
    renderField('typing…');

    fireEvent.click(screen.getByRole('button', { name: 'Rewrite body with AI' }));
    await waitFor(() => expect(screen.getByLabelText('body').getAttribute('readonly')).not.toBeNull());

    fireEvent.keyDown(screen.getByLabelText('body'), { key: 'Escape' });
    expect(screen.getByLabelText('body').getAttribute('readonly')).toBeNull();

    resolve({ ok: true, value: { text: 'too late' } });
    await new Promise((r) => setTimeout(r, 0));
    expect(fieldValue()).toBe('typing…');
  });
});
