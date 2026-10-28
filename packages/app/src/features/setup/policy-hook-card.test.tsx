import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PolicyHookCard } from './policy-hook-card';

const sampleInfo = {
  scriptPath: '/Users/test/policy-hook.js',
  claudeSnippet: '{\n  "matcher": "Bash"\n}',
  codexSnippet: '{\n  "matcher": "Bash"\n}',
};

afterEach(cleanup);

describe('PolicyHookCard', () => {
  it('renders script path and snippets when info resolves', async () => {
    window.midniteStudio = {
      toolApproval: {
        onRequested: vi.fn(),
        onResolved: vi.fn(),
        answer: vi.fn(),
        hookInfo: vi.fn(async () => ({ ok: true, value: sampleInfo })),
      },
    } as never;

    render(<PolicyHookCard />);
    await waitFor(() => expect(screen.getByTestId('policy-hook-card')).toBeTruthy());
    expect(screen.getByText('/Users/test/policy-hook.js')).toBeTruthy();
    expect(screen.getByText('Claude Code (~/.claude/settings.json)')).toBeTruthy();
    expect(screen.getByText('Codex (~/.codex/hooks.json)')).toBeTruthy();
  });

  it('allows copying path and snippets to clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });

    window.midniteStudio = {
      toolApproval: {
        onRequested: vi.fn(),
        onResolved: vi.fn(),
        answer: vi.fn(),
        hookInfo: vi.fn(async () => ({ ok: true, value: sampleInfo })),
      },
    } as never;

    render(<PolicyHookCard />);
    await waitFor(() => expect(screen.getByTestId('copy-hook-path')).toBeTruthy());

    fireEvent.click(screen.getByTestId('copy-hook-path'));
    expect(writeText).toHaveBeenCalledWith('/Users/test/policy-hook.js');

    fireEvent.click(screen.getByTestId('copy-claude-hook'));
    expect(writeText).toHaveBeenCalledWith(sampleInfo.claudeSnippet);

    fireEvent.click(screen.getByTestId('copy-codex-hook'));
    expect(writeText).toHaveBeenCalledWith(sampleInfo.codexSnippet);
  });
});
