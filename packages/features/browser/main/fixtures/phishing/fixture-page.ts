import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOGIN_FORM_READ_SNIPPET, type LoginFormRead } from '../../login-form-read';

/**
 * Test-only helpers for Theme F's phishing fixtures (Phase 117): load an HTML fixture as jsdom's
 * document and run the login-form snippet over it, the way main runs it in an isolated world.
 */

export function fixture(name: string): string {
  return readFileSync(join(__dirname, name), 'utf8');
}

/** Load `html` as the current document, with `<base href=pageUrl>` so relative actions resolve against it. */
export function loadPage(html: string, pageUrl: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const base = parsed.createElement('base');
  base.setAttribute('href', pageUrl);
  parsed.head.prepend(base);
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

export function runSnippet(): LoginFormRead {
  return (0, eval)(LOGIN_FORM_READ_SNIPPET) as LoginFormRead;
}

export function resetPage(): void {
  document.replaceChild(document.createElement('html'), document.documentElement);
}
