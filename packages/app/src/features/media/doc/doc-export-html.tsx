import Markdown from 'react-markdown';
import { renderToStaticMarkup } from 'react-dom/server';
import remarkGfm from 'remark-gfm';
import { all, createLowlight } from 'lowlight';
import type { Element, Root, RootContent } from 'hast';

const lowlight = createLowlight(all);

/**
 * Highlights fenced code in the exported page with the same lowlight grammar
 * set as the editor. A fence with a language we do not know (or none) stays
 * plain, exactly as react-markdown rendered it.
 */
export function rehypeLowlight() {
  const walk = (node: Root | Element): void => {
    for (const child of node.children as RootContent[]) {
      if (child.type !== 'element') continue;
      if (child.tagName === 'pre') {
        const code = child.children.find((c): c is Element => c.type === 'element' && c.tagName === 'code');
        const cls = code?.properties?.className;
        const lang = Array.isArray(cls)
          ? String(cls.find((c) => String(c).startsWith('language-')) ?? '').slice('language-'.length)
          : '';
        const first = code?.children[0];
        if (code && lang && lowlight.registered(lang) && first?.type === 'text') {
          code.children = lowlight.highlight(lang, first.value).children as Element['children'];
        }
      } else {
        walk(child);
      }
    }
  };
  return (tree: Root) => walk(tree);
}

/**
 * The standalone HTML a Docs export writes (Phase 99 Theme B), and the page
 * main prints for the PDF. Rendered with the same react-markdown + GFM
 * pipeline as the app's markdown preview; raw HTML in the doc is escaped, not
 * rendered, exactly as there. The CSS below is `MARKDOWN_PROSE_CLASSES`
 * written out as plain rules — the Tailwind classes cannot travel with a file
 * that opens outside the app. Loaded with `import()` only when exporting.
 */
export const DOC_EXPORT_CSS = `
:root { color-scheme: light; }
body { margin: 0; background: #fff; color: #1f2328; font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 40px 24px; }
h1 { font-size: 1.6em; font-weight: 600; margin: 1em 0 .5em; }
h2 { font-size: 1.3em; font-weight: 600; margin: 1em 0 .5em; }
h4, h5, h6 { font-size: 1em; font-weight: 600; margin: .8em 0 .3em; }
h3 { font-size: 1.1em; font-weight: 600; margin: .9em 0 .4em; }
p { margin: .6em 0; }
a { color: #0969da; text-decoration: underline; text-underline-offset: 2px; }
blockquote { margin: .6em 0; border-left: 3px solid #d0d7de; padding-left: 12px; color: #59636e; }
code { border-radius: 4px; background: #f3f4f6; padding: .1em .35em; font: .85em ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { overflow-x: auto; border-radius: 6px; background: #f3f4f6; padding: 12px; }
pre code { background: transparent; padding: 0; }
img { max-width: 100%; height: auto; border-radius: 6px; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-doctag, .hljs-section { color: #b6246f; }
.hljs-string, .hljs-regexp, .hljs-symbol, .hljs-attr, .hljs-attribute, .hljs-selector-attr, .hljs-selector-pseudo { color: #124f8f; }
.hljs-number, .hljs-bullet, .hljs-link, .hljs-type, .hljs-built_in, .hljs-params, .hljs-variable, .hljs-template-variable { color: #b34f0e; }
.hljs-title, .hljs-function, .hljs-name, .hljs-selector-id, .hljs-selector-class { color: #6d3fb0; }
.hljs-comment, .hljs-quote { color: #6e7781; font-style: italic; }
.hljs-meta, .hljs-tag { color: #0b6e66; }
.hljs-addition { color: #1a7f37; }
.hljs-deletion { color: #cf222e; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 600; }
hr { margin: 1em 0; border: 0; border-top: 1px solid #d0d7de; }
ul { list-style: disc; padding-left: 1.4em; }
ol { list-style: decimal; padding-left: 1.4em; }
li { margin: .15em 0; }
li.task-list-item { list-style: none; }
li.task-list-item input { margin: 0 .4em 0 -1.2em; }
table { width: 100%; border-collapse: collapse; margin: .6em 0; }
th, td { border: 1px solid #d0d7de; padding: 4px 8px; text-align: left; }
th { background: #f6f8fa; }
@media print { main { padding: 0; } a { color: inherit; } }
`;

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildDocHtml(title: string, markdown: string): string {
  const body = renderToStaticMarkup(<Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeLowlight]}>{markdown}</Markdown>);
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${DOC_EXPORT_CSS}</style>`,
    '</head>',
    `<body><main>${body}</main></body>`,
    '</html>',
    '',
  ].join('\n');
}
