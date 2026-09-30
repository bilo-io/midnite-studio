// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openLinkFromEvent = vi.fn();
vi.mock('../services/open-in-midnite', () => ({
  openLinkFromEvent: (...a: unknown[]) => openLinkFromEvent(...a),
}));

import { ForgeRefLink } from './forge-ref-link';

const URL = 'https://github.com/o/r/pull/12';

describe('ForgeRefLink', () => {
  beforeEach(() => {
    cleanup();
    openLinkFromEvent.mockReset();
  });

  it('renders #number and opens in-app on plain click without bubbling', () => {
    const outer = vi.fn();
    render(
      <div onClick={outer}>
        <ForgeRefLink url={URL} number={12} repoId="r1" />
      </div>,
    );
    fireEvent.click(screen.getByRole('link', { name: '#12' }));
    const [url, mods, opts] = openLinkFromEvent.mock.calls[0]!;
    expect(url).toBe(URL);
    expect(mods).toMatchObject({ metaKey: false, ctrlKey: false });
    expect(opts).toEqual({ originRepoId: 'r1', preferInAppRoute: true });
    expect(outer).not.toHaveBeenCalled();
  });

  it('forwards Mod-click modifiers so the seam opens the browser', () => {
    render(<ForgeRefLink url={URL} number={12} />);
    fireEvent.click(screen.getByRole('link'), { metaKey: true });
    expect(openLinkFromEvent.mock.calls[0]![1]).toMatchObject({ metaKey: true });
  });
});
