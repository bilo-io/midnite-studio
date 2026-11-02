// vitest/jsdom: the "Find more clips" list over a fake bridge — roles and the URL handed to shell.openExternal.
import { ANIMATION_SOURCE_SITES, type MidniteStudioBridge } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SourceLinks } from './source-links';

function installShell() {
  const openExternal = vi.fn().mockResolvedValue({ ok: true });
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = { shell: { openExternal } } as unknown as Partial<MidniteStudioBridge>;
  return openExternal;
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
});

describe('SourceLinks', () => {
  it('lists every catalogue site and flags the ones that need an account', () => {
    installShell();
    render(<SourceLinks query="" />);
    const list = screen.getByRole('list', { name: 'Find more clips' });
    expect(within(list).getAllByRole('button')).toHaveLength(ANIMATION_SOURCE_SITES.length);
    expect(within(list).getByRole('button', { name: 'Open Mixamo' }).textContent).toContain('account');
    expect(within(list).getByRole('button', { name: 'Open Quaternius' }).textContent).not.toContain('account');
    expect(screen.getByText(/Downloaded something\? Drop it/)).toBeTruthy();
  });

  it('opens the encoded search for the current text in the system browser', () => {
    const openExternal = installShell();
    render(<SourceLinks query="sword swing" />);
    fireEvent.click(screen.getByRole('button', { name: 'Search on Poly Pizza' }));
    expect(openExternal).toHaveBeenCalledWith({ url: 'https://poly.pizza/search/sword%20swing' });
  });

  it('opens the site home when the search is empty', () => {
    const openExternal = installShell();
    render(<SourceLinks query="  " />);
    fireEvent.click(screen.getByRole('button', { name: 'Open OpenGameArt' }));
    expect(openExternal).toHaveBeenCalledWith({ url: 'https://opengameart.org/' });
  });
});
