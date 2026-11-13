import { Fragment, type ReactNode } from 'react';

/**
 * A renderer for the one markdown file the site shows: `docs/PRIVACY.md`, generated from the app's
 * network registry. It handles exactly the subset that file uses (headings, paragraphs, bullet lists
 * with wrapped continuation lines, pipe tables, `code`, **bold**) and throws away anything else as
 * plain text, so a new construct shows up as visible text rather than as a silent gap.
 */

type Block =
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

export function parsePrivacyMarkdown(source: string): Block[] {
  const lines = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'h', level: (heading[1] ?? '#').length as 1 | 2 | 3, text: heading[2] ?? '' });
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const table: string[] = [];
      while (i < lines.length && (lines[i] ?? '').startsWith('|')) table.push(lines[i++] ?? '');
      const [head, , ...rows] = table;
      blocks.push({ kind: 'table', head: cells(head ?? ''), rows: rows.map(cells) });
      continue;
    }
    if (/^- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim() !== '' && !/^#{1,3}\s/.test(lines[i] ?? '')) {
        const current = lines[i] ?? '';
        if (current.startsWith('- ')) items.push(current.slice(2).trim());
        else items[items.length - 1] += ` ${current.trim()}`;
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^#{1,3}\s/.test(lines[i] ?? '') &&
      !(lines[i] ?? '').startsWith('|') &&
      !(lines[i] ?? '').startsWith('- ')
    ) {
      paragraph.push((lines[i] ?? '').trim());
      i++;
    }
    blocks.push({ kind: 'p', text: paragraph.join(' ') });
  }
  return blocks;
}

/** `code` and **bold** spans inside one run of text. */
const inline = (text: string): ReactNode[] =>
  text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      return (
        <code key={index} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 3) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return <Fragment key={index}>{part}</Fragment>;
  });

export const PrivacyMarkdown = ({ source }: { source: string }) => (
  <div className="flex flex-col gap-4 text-fg-muted" data-testid="privacy-body">
    {parsePrivacyMarkdown(source)
      // The page's own `<h1>` is the title; the file's `# Privacy` would be a second one.
      .filter((b) => !(b.kind === 'h' && b.level === 1))
      .map((block, index) => {
        if (block.kind === 'h') {
          return block.level === 2 ? (
            <h2 key={index} className="mt-8 text-2xl font-semibold text-fg">
              {block.text}
            </h2>
          ) : (
            <h3 key={index} className="mt-4 text-lg font-semibold text-fg">
              {block.text}
            </h3>
          );
        }
        if (block.kind === 'ul') {
          return (
            <ul key={index} className="list-disc space-y-2 pl-6">
              {block.items.map((item, n) => (
                <li key={n}>{inline(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'table') {
          return (
            <div key={index} className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {block.head.map((h, n) => (
                      <th key={n} className="border-b border-line px-3 py-2 font-semibold text-fg">
                        {inline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((c, n) => (
                        <td key={n} className="border-b border-line px-3 py-2 align-top">
                          {inline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return <p key={index}>{inline(block.text)}</p>;
      })}
  </div>
);
