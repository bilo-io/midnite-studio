// vitest/jsdom: asserts DOM structure only — the rotation/pulse is CSS, covered by styles.css review.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PromptTextarea } from './prompt-input';

describe('PromptTextarea', () => {
  it('wraps the textarea in the shared gradient-border prompt box', () => {
    render(<PromptTextarea aria-label="Prompt" />);
    const box = screen.getByLabelText('Prompt').parentElement!;
    expect(box.classList.contains('gradient-border')).toBe(true);
    expect(box.classList.contains('media-prompt')).toBe(true);
  });
});
