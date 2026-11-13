import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { parsePrivacyMarkdown } from './privacy-markdown';
import { PrivacyPage, publicPrivacySource } from './privacy-page';
import privacyDoc from '../../../../docs/PRIVACY.md?raw';

describe('PrivacyPage', () => {
  it('has one h1 and renders the statement’s three sections', () => {
    render(<PrivacyPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const body = screen.getByTestId('privacy-body');
    expect(within(body).getByRole('heading', { level: 2, name: '1. What leaves this Mac' })).toBeDefined();
    expect(within(body).getByRole('heading', { level: 2, name: /^2\. What stays on this Mac/ })).toBeDefined();
    expect(within(body).getByRole('heading', { level: 2, name: '3. Who can reach in' })).toBeDefined();
  });

  it('renders the generated host tables', () => {
    render(<PrivacyPage />);
    const tables = within(screen.getByTestId('privacy-body')).getAllByRole('table');
    expect(tables.length).toBeGreaterThanOrEqual(2);
    expect(tables.every((t) => within(t).getAllByRole('row').length > 1)).toBe(true);
  });

  it('never links to, or names, a repository', () => {
    const { container } = render(<PrivacyPage />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => /github\.com|bilo-io/i.test(h))).toBe(false);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/bilo-io|midnite-apps|SECURITY\.md/);
  });

  it('shows every line of the document except the file title and the repository pointer', () => {
    const blocks = parsePrivacyMarkdown(publicPrivacySource(privacyDoc));
    expect(blocks.some((b) => b.kind === 'ul')).toBe(true);
    expect(publicPrivacySource(privacyDoc)).not.toContain('SECURITY.md');
  });
});

describe('parsePrivacyMarkdown', () => {
  it('parses headings, wrapped bullets, paragraphs and tables', () => {
    const blocks = parsePrivacyMarkdown(
      ['# T', '', '## A', '', 'one', 'two', '', '- a', '  b', '- c', '', '| h1 | h2 |', '|---|---|', '| x | y |'].join('\n'),
    );
    expect(blocks).toEqual([
      { kind: 'h', level: 1, text: 'T' },
      { kind: 'h', level: 2, text: 'A' },
      { kind: 'p', text: 'one two' },
      { kind: 'ul', items: ['a b', 'c'] },
      { kind: 'table', head: ['h1', 'h2'], rows: [['x', 'y']] },
    ]);
  });
});
