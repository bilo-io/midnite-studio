import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}));

import { bindAppNavigationGuard, checkAppNavigationUrl, isAppDocumentUrl } from './app-navigation';

describe('isAppDocumentUrl', () => {
  it('accepts file and mstudio-file documents and the dev-server origin', () => {
    expect(isAppDocumentUrl('file:///tmp/index.html', null)).toBe(true);
    expect(isAppDocumentUrl('mstudio-file://repo/r1/a.png', null)).toBe(true);
    expect(isAppDocumentUrl('http://localhost:5173/', 'http://localhost:5173')).toBe(true);
    expect(isAppDocumentUrl('https://example.com/', null)).toBe(false);
  });
});

describe('checkAppNavigationUrl', () => {
  it('allows in-app navigation and routes external http(s) to openExternal', () => {
    expect(checkAppNavigationUrl('file:///tmp/index.html', null)).toEqual({ allowed: true });
    expect(checkAppNavigationUrl('http://localhost:5173/graph', 'http://localhost:5173')).toEqual({
      allowed: true,
    });
    expect(checkAppNavigationUrl('https://example.com', null)).toEqual({
      allowed: false,
      openExternal: true,
    });
    expect(checkAppNavigationUrl('javascript:alert(1)', null)).toEqual({ allowed: false });
  });
});

describe('bindAppNavigationGuard', () => {
  it('registers will-navigate and will-redirect handlers', () => {
    const handlers = new Map<string, (event: { preventDefault: () => void }, url: string) => void>();
    const webContents = {
      on: vi.fn((event: string, handler: (event: { preventDefault: () => void }, url: string) => void) => {
        handlers.set(event, handler);
      }),
    };

    bindAppNavigationGuard(webContents as never, null);

    expect(webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function));
    expect(webContents.on).toHaveBeenCalledWith('will-redirect', expect.any(Function));

    const event = { preventDefault: vi.fn() };
    handlers.get('will-navigate')?.(event, 'https://example.com');
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
