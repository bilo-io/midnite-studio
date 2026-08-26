import { describe, expect, it } from 'vitest';

import { splitTrailers } from './parse-trailers';

describe('splitTrailers', () => {
  it('splits this repository’s own footer off the body', () => {
    const { body, trailers } = splitTrailers(
      [
        'feat(phase-12): rebuild the commit inspector',
        '',
        'Rendered message, a file tree, and a diff.',
        '',
        'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
      ].join('\n'),
    );

    expect(body).toBe(
      'feat(phase-12): rebuild the commit inspector\n\nRendered message, a file tree, and a diff.',
    );
    expect(trailers).toEqual([
      { key: 'Co-Authored-By', value: 'Claude Opus 5 <noreply@anthropic.com>' },
    ]);
  });

  it('takes several trailers in document order', () => {
    const { trailers } = splitTrailers(
      ['subject', '', 'Signed-off-by: A <a@b.io>', 'Reviewed-by: B <b@c.io>'].join('\n'),
    );
    expect(trailers.map((t) => t.key)).toEqual(['Signed-off-by', 'Reviewed-by']);
  });

  it('refuses the block when one line in it is prose', () => {
    // Git is looser (it tolerates 25% non-trailer lines), but the consequence of
    // being loose is a real final paragraph restyled as metadata and visually
    // detached from the message it belongs to.
    const message = ['subject', '', 'Reviewed-by: B <b@c.io>', 'and this line is not a trailer'].join(
      '\n',
    );
    const { body, trailers } = splitTrailers(message);
    expect(trailers).toEqual([]);
    expect(body).toBe(message);
  });

  it('does not treat a single-line message as entirely trailers', () => {
    // No blank line before it, so there is no block. Without this test the
    // message "Fix: the thing" renders as a commit with no message at all.
    const { body, trailers } = splitTrailers('Fix: the thing');
    expect(trailers).toEqual([]);
    expect(body).toBe('Fix: the thing');
  });

  it('does not read a trailing bare URL as a trailer', () => {
    // `https://example.com` matches `Key: value` with key `https`.
    const message = ['subject', '', 'https://example.com/docs'].join('\n');
    const { body, trailers } = splitTrailers(message);
    expect(trailers).toEqual([]);
    expect(body).toBe(message);
  });

  it('rejects a key containing a space', () => {
    const message = ['subject', '', 'Note this: it broke'].join('\n');
    expect(splitTrailers(message).trailers).toEqual([]);
  });

  it('folds an indented continuation into the trailer above it', () => {
    const { trailers } = splitTrailers(
      ['subject', '', 'Co-Authored-By: Someone With A Very Long', '    Name <n@example.com>'].join(
        '\n',
      ),
    );
    expect(trailers).toEqual([
      { key: 'Co-Authored-By', value: 'Someone With A Very Long Name <n@example.com>' },
    ]);
  });

  it('rejects an indented line with no trailer above it', () => {
    const message = ['subject', '', '    indented code sample'].join('\n');
    expect(splitTrailers(message).trailers).toEqual([]);
  });

  it('keeps a trailer-shaped line that is not in the last paragraph as body', () => {
    const message = [
      'subject',
      '',
      'Signed-off-by: not-a-trailer-here <x@y.io>',
      '',
      'a closing paragraph of prose',
    ].join('\n');
    const { body, trailers } = splitTrailers(message);
    expect(trailers).toEqual([]);
    expect(body).toBe(message);
  });

  it('accepts a trailer with an empty value', () => {
    expect(splitTrailers(['subject', '', 'Fixes:'].join('\n')).trailers).toEqual([
      { key: 'Fixes', value: '' },
    ]);
  });

  it('trims the trailing whitespace a git message usually carries', () => {
    const { body, trailers } = splitTrailers('subject\n\nSigned-off-by: A <a@b.io>\n\n');
    expect(body).toBe('subject');
    expect(trailers).toHaveLength(1);
  });

  it('handles an empty message', () => {
    expect(splitTrailers('')).toEqual({ body: '', trailers: [] });
  });
});
