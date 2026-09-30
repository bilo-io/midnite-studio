import { describe, expect, it } from 'vitest';

import { buildDocHtml } from './doc-export-html';

describe('buildDocHtml', () => {
  it('renders GFM into a standalone page with the prose CSS inlined', () => {
    const html = buildDocHtml('Plan <v2>', '# Plan\n\n- [x] done\n\n| a |\n| - |\n| 1 |\n\n[link](https://x.dev)');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Plan &lt;v2&gt;</title>');
    expect(html).toContain('<style>');
    expect(html).toContain('<h1>Plan</h1>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('<table>');
    expect(html).toContain('href="https://x.dev"');
    expect(html).not.toMatch(/<link|<script/);
  });

  it('escapes raw HTML in the doc rather than rendering it', () => {
    const html = buildDocHtml('t', 'hi <script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
