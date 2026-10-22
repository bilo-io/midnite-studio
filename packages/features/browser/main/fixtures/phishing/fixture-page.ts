import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOGIN_FORM_READ_SNIPPET, type LoginFormRead } from '../../login-form-read';

/**
 * Test-only helpers for Theme F's phishing fixtures (Phase 117): load an HTML fixture as jsdom's
 * document and run the login-form snippet over it, the way main runs it in an isolated world.
 */

/**
 * jsdom's globals, typed structurally: the main half compiles without the DOM lib (it is Node code),
 * so the few DOM members these helpers touch are named here instead.
 */
type DomNode = object;
type DomElement = DomNode & { setAttribute(name: string, value: string): void };
type DomDocument = {
  documentElement: DomNode;
  head: { prepend(node: DomNode): void };
  createElement(tag: string): DomElement;
  importNode(node: DomNode, deep: boolean): DomNode;
  replaceChild(next: DomNode, previous: DomNode): void;
};
const dom = globalThis as unknown as {
  document: DomDocument;
  DOMParser: new () => { parseFromString(html: string, type: 'text/html'): DomDocument };
};

export function fixture(name: string): string {
  return readFileSync(join(__dirname, name), 'utf8');
}

/** Load `html` as the current document, with `<base href=pageUrl>` so relative actions resolve against it. */
export function loadPage(html: string, pageUrl: string): void {
  const parsed = new dom.DOMParser().parseFromString(html, 'text/html');
  const base = parsed.createElement('base');
  base.setAttribute('href', pageUrl);
  parsed.head.prepend(base);
  dom.document.replaceChild(dom.document.importNode(parsed.documentElement, true), dom.document.documentElement);
}

export function runSnippet(): LoginFormRead {
  return (0, eval)(LOGIN_FORM_READ_SNIPPET) as LoginFormRead;
}

export function resetPage(): void {
  dom.document.replaceChild(dom.document.createElement('html'), dom.document.documentElement);
}
