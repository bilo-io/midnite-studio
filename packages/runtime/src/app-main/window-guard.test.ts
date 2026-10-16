import { describe, expect, it, vi } from 'vitest';

import { guardAppWindow, isExternalLink, type GuardableWebContents } from './window-guard';

function fakeContents(current = 'file:///Applications/X.app/index.html') {
  let openHandler: ((d: { url: string }) => { action: 'deny' }) | null = null;
  let navigate: ((event: { preventDefault(): void; url?: string }, url?: string) => void) | null = null;
  const contents: GuardableWebContents = {
    setWindowOpenHandler: (h) => {
      openHandler = h;
    },
    on: (_event, listener) => {
      navigate = listener;
    },
    getURL: () => current,
  };
  const openExternal = vi.fn();
  guardAppWindow(contents, { openExternal });
  return {
    openExternal,
    open: (url: string) => openHandler!({ url }),
    navigate: (url: string, legacy = false) => {
      const event = { preventDefault: vi.fn(), ...(legacy ? {} : { url }) };
      navigate!(event, url);
      return event.preventDefault;
    },
  };
}

describe('guardAppWindow', () => {
  it('opens no child window, and hands an https link to the system browser', () => {
    const w = fakeContents();
    expect(w.open('https://example.com/a')).toEqual({ action: 'deny' });
    expect(w.openExternal).toHaveBeenCalledWith('https://example.com/a');
  });

  it('drops a window.open of anything that is not http(s)', () => {
    const w = fakeContents();
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'midnite-studio://view?id=graph', 'data:text/html,x']) {
      expect(w.open(url)).toEqual({ action: 'deny' });
    }
    expect(w.openExternal).not.toHaveBeenCalled();
  });

  it('stops a plain link navigating the window away, and opens it outside instead', () => {
    const w = fakeContents();
    const prevented = w.navigate('https://example.com/b');
    expect(prevented).toHaveBeenCalled();
    expect(w.openExternal).toHaveBeenCalledWith('https://example.com/b');
  });

  it('stops a navigation to another local file without opening anything', () => {
    const w = fakeContents();
    expect(w.navigate('file:///Users/me/secret.html')).toHaveBeenCalled();
    expect(w.openExternal).not.toHaveBeenCalled();
  });

  it('lets an in-page anchor and a reload of the same document through', () => {
    const w = fakeContents('http://localhost:5173/');
    expect(w.navigate('http://localhost:5173/#section')).not.toHaveBeenCalled();
    expect(w.navigate('http://localhost:5173/')).not.toHaveBeenCalled();
    expect(w.openExternal).not.toHaveBeenCalled();
  });

  it('reads the url from the legacy second argument on an older event shape', () => {
    const w = fakeContents();
    expect(w.navigate('https://example.com/c', true)).toHaveBeenCalled();
    expect(w.openExternal).toHaveBeenCalledWith('https://example.com/c');
  });
});

describe('isExternalLink', () => {
  it('is http and https only', () => {
    expect(isExternalLink('HTTPS://x.y')).toBe(true);
    expect(isExternalLink('http://x.y')).toBe(true);
    expect(isExternalLink('ftp://x.y')).toBe(false);
    expect(isExternalLink('mailto:a@b.c')).toBe(false);
  });
});
