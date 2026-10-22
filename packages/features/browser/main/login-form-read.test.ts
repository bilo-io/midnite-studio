import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixture, loadPage, resetPage, runSnippet } from './fixtures/phishing/fixture-page';
import { LOGIN_FORM_READ_SNIPPET, LOGIN_FORM_WORLD_ID, readLoginForm } from './login-form-read';

/**
 * The snippet is a string main hands to `executeJavaScriptInIsolatedWorld`; here it runs against
 * jsdom's document instead, which is the same DOM API surface. What jsdom cannot show is the world
 * boundary itself (it has one world) — that is Electron's guarantee, pinned below by the world id
 * the read asks for. Fixtures live in `fixtures/phishing/` and are shared with `phishing-rules.test.ts`.
 */

afterEach(resetPage);

describe('LOGIN_FORM_READ_SNIPPET', () => {
  it('finds no password field on a page without one', () => {
    loadPage('<form action="/search"><input name="q"></form>', 'https://example.com/');
    expect(runSnippet()).toEqual({ hasPasswordField: false, formActionOrigins: [] });
  });

  it('finds the password field and resolves a relative action against the page', () => {
    loadPage(fixture('github-real.html'), 'https://github.com/login');
    expect(runSnippet()).toEqual({ hasPasswordField: true, formActionOrigins: ['https://github.com'] });
  });

  it('matches type="PASSWORD" case-insensitively and reads past named-input clobbering', () => {
    loadPage(fixture('github-login-app.html'), 'https://github-login.app/');
    // `<input name="action">` makes `form.action` the input element and `<input name="getAttribute">`
    // shadows the method — the snippet reads through the prototypes and still sees the real target.
    expect(runSnippet()).toEqual({ hasPasswordField: true, formActionOrigins: ['https://collect.example.net'] });
  });

  it('reads past a clobbered document.forms / querySelectorAll on the document', () => {
    loadPage(
      '<img name="querySelectorAll"><img name="forms"><form action="https://elsewhere.example/p"><input type=password></form>',
      'https://example.com/',
    );
    expect(runSnippet().formActionOrigins).toEqual(['https://elsewhere.example']);
  });

  it('reads past a clobbered document.URL / baseURI, and an empty action posts to the page', () => {
    loadPage('<img name="URL" src="x"><img name="baseURI" src="x"><form><input type=password></form>', 'https://example.com/login');
    // An empty action resolves against the document's real URL (jsdom's, here) — never against a clobbering <img>.
    expect(runSnippet().formActionOrigins).toEqual([new URL((globalThis as unknown as { location: { href: string } }).location.href).origin]);
  });

  it("counts a submit button's formaction as a target too", () => {
    loadPage(
      '<form action="/login"><input type=password><button formaction="https://drop.example.net/x">Go</button></form>',
      'https://example.com/',
    );
    expect(runSnippet().formActionOrigins).toEqual(['https://example.com', 'https://drop.example.net']);
  });

  it('counts a password field outside any form, with no action origin', () => {
    loadPage('<div><input type="password"></div>', 'https://example.com/');
    expect(runSnippet()).toEqual({ hasPasswordField: true, formActionOrigins: [] });
  });

  it('uses the form owner (form= attribute) and skips non-web actions', () => {
    loadPage(
      '<form id="f" action="https://auth.example.org/x"></form><input type="password" form="f">' +
        '<form action="javascript:void 0"><input type="password"></form>',
      'https://example.com/',
    );
    expect(runSnippet().formActionOrigins).toEqual(['https://auth.example.org']);
  });

  it('installs nothing: no new globals, no listeners', () => {
    loadPage(fixture('http-login.html'), 'http://members.example/');
    const win = (globalThis as unknown as { window: object }).window;
    const before = new Set(Object.getOwnPropertyNames(win));
    const addListener = vi.spyOn(EventTarget.prototype, 'addEventListener');
    runSnippet();
    expect(addListener).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyNames(win).filter((name) => !before.has(name))).toEqual([]);
    addListener.mockRestore();
  });

  it('is fixed text: nothing interpolated from outside, no observers, timers or listeners in it', () => {
    expect(LOGIN_FORM_READ_SNIPPET).not.toMatch(/addEventListener|MutationObserver|setTimeout|setInterval|postMessage|fetch\(|window\.\w+\s*=/);
  });
});

describe('readLoginForm', () => {
  it('runs the fixed snippet in its own isolated world — never world 0, never 999', async () => {
    const exec = vi.fn(async () => ({ hasPasswordField: true, formActionOrigins: ['https://a.example'] }));
    expect(await readLoginForm({ executeJavaScriptInIsolatedWorld: exec })).toEqual({
      hasPasswordField: true,
      formActionOrigins: ['https://a.example'],
    });
    expect(exec).toHaveBeenCalledWith(LOGIN_FORM_WORLD_ID, [{ code: LOGIN_FORM_READ_SNIPPET }], false);
    expect(LOGIN_FORM_WORLD_ID).not.toBe(0);
    expect(LOGIN_FORM_WORLD_ID).not.toBe(999);
  });

  it('answers null for a malformed result or a failed read', async () => {
    expect(await readLoginForm({ executeJavaScriptInIsolatedWorld: async () => ({ hasPasswordField: 'yes' }) })).toBeNull();
    expect(await readLoginForm({ executeJavaScriptInIsolatedWorld: async () => Promise.reject(new Error('gone')) })).toBeNull();
    expect(await readLoginForm({} as never)).toBeNull();
  });
});
