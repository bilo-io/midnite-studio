import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SetupMeta, displayVersion, releaseNotesUrl } from './setup-meta';

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('displayVersion / releaseNotesUrl', () => {
  it('drops a suffix that only repeats the name', () => {
    expect(displayVersion('2.1.287 (Claude Code)', 'Claude Code')).toBe('2.1.287');
    expect(displayVersion('1.0 (beta)', 'Claude Code')).toBe('1.0 (beta)');
  });
  it('maps known tools and returns undefined for unknown ones', () => {
    expect(releaseNotesUrl('node', 'v26.9.0')).toBe('https://nodejs.org/en/blog/release/v26.9.0');
    expect(releaseNotesUrl('pnpm', '12.4.1')).toBe('https://github.com/pnpm/pnpm/releases');
    expect(releaseNotesUrl('mystery', '1.0')).toBeUndefined();
  });
});

describe('SetupMeta', () => {
  it('reveals a path through the bridge, without bubbling to the row', () => {
    const reveal = vi.fn(async () => ({ ok: true }));
    (window as unknown as { midniteStudio: unknown }).midniteStudio = { setup: { reveal } };
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <SetupMeta kind="path" toolId="git" label="git" path="/usr/bin/git" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open git in Finder' }));
    expect(reveal).toHaveBeenCalledWith({ id: 'git' });
    expect(onRow).not.toHaveBeenCalled();
  });

  it('renders an unknown tool version as plain text', () => {
    render(<SetupMeta kind="version" toolId="mystery" label="Mystery" version="1.0" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('setup-meta').textContent).toBe('1.0');
  });

  it('opens release notes without bubbling', () => {
    const openExternal = vi.fn(async () => ({ ok: true }));
    (window as unknown as { midniteStudio: unknown }).midniteStudio = { shell: { openExternal } };
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <SetupMeta kind="version" toolId="bun" label="Bun" version="1.2.3" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(openExternal).toHaveBeenCalledWith({ url: 'https://github.com/oven-sh/bun/releases' });
    expect(onRow).not.toHaveBeenCalled();
  });
});
