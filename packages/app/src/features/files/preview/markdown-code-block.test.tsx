// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { MarkdownCode, MarkdownPre } from './markdown-code-block';

vi.mock('@bilo-io/ui/theme', () => ({ useTheme: () => ({ resolved: 'dark' }) }));
vi.mock('../../../lib/highlighter', () => {
  const loaded: string[] = [];
  const hl = {
    getLoadedLanguages: () => loaded,
    loadLanguage: async (l: string) => {
      loaded.push(l);
    },
    codeToHtml: (code: string, o: { lang: string }) =>
      `<pre class="shiki"><code><span class="tok" data-lang="${o.lang}">${code}</span></code></pre>`,
  };
  return { getHighlighter: async () => hl, resolveHighlightTheme: async () => 'github-dark' };
});

const md = (src: string) =>
  render(
    <Markdown remarkPlugins={[remarkGfm]} components={{ code: MarkdownCode, pre: MarkdownPre }}>
      {src}
    </Markdown>,
  );

afterEach(cleanup);

describe('markdown code blocks', () => {
  it('highlights a tagged block and labels the language', async () => {
    const { container } = md('```ts\nconst a = 1;\n```');
    await waitFor(() => expect(container.querySelector('.tok')).not.toBeNull());
    expect(container.querySelector('.tok')?.getAttribute('data-lang')).toBe('ts');
    expect(container.querySelector('[data-testid=md-code-lang]')?.textContent).toBe('ts');
  });

  it('renders an untagged block as plain monospace', () => {
    const { container } = md('```\nplain text\n```');
    expect(container.querySelector('.tok')).toBeNull();
    expect(container.querySelector('pre code')?.textContent).toBe('plain text');
  });

  it('renders a diff block with per-line classes', () => {
    const { container } = md('```diff\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n```');
    const kinds = [...container.querySelectorAll('[data-diff-kind]')].map((e) => e.getAttribute('data-diff-kind'));
    expect(kinds).toEqual(['file', 'file', 'hunk', 'ctx', 'del', 'add']);
    expect(container.querySelector('[data-diff-kind="add"]')?.className).toContain('bg-success/10');
    expect(container.querySelector('[data-diff-kind="del"]')?.className).toContain('bg-destructive/10');
    expect(container.querySelector('[data-diff-kind="hunk"]')?.className).toContain('text-primary');
  });

  it('treats an untagged unified diff as a diff', () => {
    const { container } = md('```\n@@ -1 +1 @@\n-a\n+b\n```');
    expect(container.querySelectorAll('[data-diff-kind]').length).toBe(3);
  });

  it('leaves inline code, tables and task lists alone', () => {
    const { container } = md('use `foo()` here\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done');
    expect(container.querySelector('[data-testid=md-code-block]')).toBeNull();
    expect(container.querySelector('p code')?.textContent).toBe('foo()');
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('input[type=checkbox]')).not.toBeNull();
  });
});
