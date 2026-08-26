import { describe, expect, it } from 'vitest';

import { segment, type Segment } from './linkify';

/** Just the interesting segments — text runs are noise in most assertions. */
const refs = (text: string): Segment[] => segment(text).filter((s) => s.kind !== 'text');

/** The whole input must survive segmentation, character for character. */
const roundTrip = (text: string): string =>
  segment(text)
    .map((s) => s.value)
    .join('');

describe('segment', () => {
  it('leaves plain prose as a single text run', () => {
    const out = segment('fix the thing that was broken');
    expect(out).toEqual([{ kind: 'text', value: 'fix the thing that was broken' }]);
  });

  it('matches a full 40-char sha without clipping it to twelve', () => {
    const sha = 'f11fafb4c693a8e38ad44f04e4908c15315843a3';
    expect(refs(`reverts ${sha} cleanly`)).toEqual([{ kind: 'sha', value: sha }]);
  });

  it('matches an abbreviated sha', () => {
    expect(refs('see 7c521fe for the fix')).toEqual([{ kind: 'sha', value: '7c521fe' }]);
  });

  it('does not treat an all-letter hex word as a sha', () => {
    // The phase doc's named false positive. `deadbeef`, `facade` and `decade`
    // are pure hex and pure English; requiring a digit rules the class out.
    for (const word of ['deadbeef', 'defaced', 'accede', 'cabbage']) {
      expect(refs(`the ${word} case`)).toEqual([]);
    }
  });

  it('does not treat a plain number as a sha', () => {
    // Hex-valid, but a commit message saying "migrated 12345678 rows" must not
    // grow a control that navigates to nothing.
    expect(refs('migrated 12345678 rows in 1234567 ms')).toEqual([]);
  });

  it('still matches an all-letter run at the full 40-char length', () => {
    // Not a word in any language, so the digit rule does not apply.
    const sha = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
    expect(refs(sha)).toEqual([{ kind: 'sha', value: sha }]);
  });

  it('ignores hex embedded in a longer word', () => {
    expect(refs('xdeadbee1x and my_abc123f_name')).toEqual([]);
  });

  it('ignores a run that is too short or too long to be a revision', () => {
    // Six is below git's practical abbreviation; 13-39 is a length git never
    // prints, so a run in that range is far likelier to be a hash of some
    // other kind than a sha somebody meant to reference.
    expect(refs('abc12 and abc123 and 1234567890abc1')).toEqual([]);
  });

  it('takes a URL whole rather than shredding the sha in its path', () => {
    // The reason URL wins the alternation: with SHA first this becomes three
    // links, one of which navigates the inspector somewhere unrelated.
    const url = 'https://github.com/o/r/commit/7c521fed00d';
    expect(refs(`see ${url}`)).toEqual([{ kind: 'url', value: url, href: url }]);
  });

  it('does not read a fragment inside a URL as an issue ref', () => {
    const url = 'https://example.com/docs#123';
    expect(refs(url)).toEqual([{ kind: 'url', value: url, href: url }]);
  });

  it('gives back sentence punctuation that the URL match swallowed', () => {
    const out = segment('fixed by https://example.com/a.');
    expect(out.at(-2)).toEqual({
      kind: 'url',
      value: 'https://example.com/a',
      href: 'https://example.com/a',
    });
    expect(out.at(-1)).toEqual({ kind: 'text', value: '.' });
    expect(roundTrip('fixed by https://example.com/a.')).toBe('fixed by https://example.com/a.');
  });

  it('keeps a closing bracket the URL itself opened', () => {
    const url = 'https://en.wikipedia.org/wiki/Git_(software)';
    expect(refs(url)).toEqual([{ kind: 'url', value: url, href: url }]);
  });

  it('drops an unbalanced closing bracket', () => {
    expect(refs('(see https://example.com/a)')).toEqual([
      { kind: 'url', value: 'https://example.com/a', href: 'https://example.com/a' },
    ]);
  });

  it('leaves a bare scheme as text', () => {
    expect(refs('https://')).toEqual([]);
  });

  it('matches an issue reference and its number', () => {
    expect(refs('closes #123')).toEqual([{ kind: 'issue', value: '#123', number: 123 }]);
  });

  it('ignores a digit run too long to be an issue number', () => {
    // Both guards are load-bearing here: the issue cap needs its trailing
    // `(?!\d)` or it links `#1234567` and orphans the `8`, and the digits that
    // remain must not then be picked up as an abbreviated sha either.
    expect(refs('#12345678')).toEqual([]);
    expect(roundTrip('#12345678')).toBe('#12345678');
  });

  it('leaves a markdown ordered-list marker alone', () => {
    // `1.` is not `#1`, and a heading's `#` has already become an element by the
    // time this runs — but the list case is the one the phase doc names.
    expect(refs('1. first\n2. second')).toEqual([]);
  });

  it('matches a trailer email', () => {
    expect(refs('Co-Authored-By: Someone <a.b+tag@sub.example.co.uk>')).toEqual([
      { kind: 'email', value: 'a.b+tag@sub.example.co.uk', address: 'a.b+tag@sub.example.co.uk' },
    ]);
  });

  it('prefers a URL over the email-shaped text inside it', () => {
    const url = 'https://example.com/u?to=a@b.com';
    expect(refs(url)).toEqual([{ kind: 'url', value: url, href: url }]);
  });

  it('finds several references in one line, in order', () => {
    expect(refs('7c521fe closes #7, see https://x.io/a — ask a@b.io')).toEqual([
      { kind: 'sha', value: '7c521fe' },
      { kind: 'issue', value: '#7', number: 7 },
      { kind: 'url', value: 'https://x.io/a', href: 'https://x.io/a' },
      { kind: 'email', value: 'a@b.io', address: 'a@b.io' },
    ]);
  });

  it('reproduces its input exactly', () => {
    // The invariant that makes it safe to replace a text node with the output:
    // segmentation may reclassify characters but must never lose one.
    for (const input of [
      '',
      'plain',
      '7c521fe closes #7, see https://x.io/a. ask a@b.io',
      'trailing https://example.com/a).',
      '#1 #22 #333',
    ]) {
      expect(roundTrip(input)).toBe(input);
    }
  });

  it('does not leak regex state between calls', () => {
    // The pattern is module-level and `g`-flagged; a missing lastIndex reset
    // makes the second call skip the start of its input.
    expect(refs('#1')).toEqual(refs('#1'));
  });
});
