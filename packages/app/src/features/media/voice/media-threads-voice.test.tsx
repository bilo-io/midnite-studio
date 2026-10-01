import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CreatePanel } from '../image/create-panel';
import { PromptForm } from '../audio/prompt-form';
import { initialPromptForm } from '../audio/prompt-form-state';
import { initialCreateState } from '../image/create-panel-state';

afterEach(cleanup);

describe('Media threads carry the voice row', () => {
  it('image create panel shows the speech toggle and mic beside Generate', () => {
    render(
      <CreatePanel
        state={initialCreateState('gemini', 'm')}
        dispatch={vi.fn()}
        statuses={[]}
        running={false}
        error={null}
        onGenerate={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Speak replies aloud' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Generate/ })).toBeTruthy();
    // Send + Mic live inside the prompt box, bottom-left
    const controls = screen.getByTestId('image-prompt-controls');
    expect(screen.getByTestId('image-prompt-input').closest('.gradient-border')!.contains(controls)).toBe(true);
    expect(controls.contains(screen.getByTestId('image-prompt-mic'))).toBe(true);
    expect(controls.contains(screen.getByTestId('image-prompt-send'))).toBe(true);
    // The prompt is pinned at the bottom of the panel, and Generate is its Send alone.
    const form = screen.getByRole('form', { name: 'Create image' });
    expect(form.lastElementChild!.contains(screen.getByTestId('image-prompt'))).toBe(true);
    expect(screen.queryByRole('button', { name: /^Generat(e|ing…)$/, hidden: false })).toBe(
      screen.getByTestId('image-prompt-send'),
    );
  });

  it('audio prompt form shows the speech toggle and mic', () => {
    render(
      <PromptForm
        state={initialPromptForm({ provider: 'import', durationS: 120, count: 2 })}
        dispatch={vi.fn()}
        statuses={[]}
        importing={false}
        error={null}
        onImport={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Speak replies aloud' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hold to talk' })).toBeTruthy();
    const controls = screen.getByTestId('audio-lyrics-controls');
    expect(screen.getByTestId('audio-lyrics-input').closest('.gradient-border')!.contains(controls)).toBe(true);
    expect(controls.contains(screen.getByTestId('audio-lyrics-mic'))).toBe(true);
    expect(controls.contains(screen.getByTestId('audio-lyrics-send'))).toBe(true);
    // Pinned at the bottom of the panel; Import moved behind the composer's "+".
    const form = screen.getByRole('form', { name: 'Create audio' });
    expect(form.lastElementChild!.contains(screen.getByTestId('audio-lyrics'))).toBe(true);
    expect(controls.contains(screen.getByTestId('audio-attach'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Import audio…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create' })).toBe(screen.getByTestId('audio-lyrics-send'));
  });
});
