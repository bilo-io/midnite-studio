import { describe, expect, it } from 'vitest';

import { parseDeck } from './deck-parser';

describe('parseDeck', () => {
  it('h1-only doc: one cover slide, title from the h1', () => {
    const deck = parseDeck('# My Deck\n\nSome intro text.\n');
    expect(deck.title).toBe('My Deck');
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]).toMatchObject({ title: 'My Deck', cover: true });
    expect(deck.slides[0]!.steps).toEqual([{ markdown: 'Some intro text.' }]);
  });

  it('three h2s under an h1: cover slide plus three slides', () => {
    const deck = parseDeck(
      '# Title\n\n## First\n\nOne.\n\n## Second\n\nTwo.\n\n## Third\n\nThree.\n',
    );
    expect(deck.slides.map((s) => s.title)).toEqual(['Title', 'First', 'Second', 'Third']);
    expect(deck.slides[0]!.cover).toBe(true);
    expect(deck.slides[1]!.cover).toBeUndefined();
  });

  it('nested h3-h6 all start new slides, not just h2', () => {
    const deck = parseDeck(
      '# Title\n\n## A\n\ntext a\n\n### A.1\n\ntext a1\n\n#### A.1.1\n\ntext deep\n\n##### A.1.1.1\n\ndeeper\n\n###### A.1.1.1.1\n\ndeepest\n',
    );
    expect(deck.slides.map((s) => s.title)).toEqual([
      'Title',
      'A',
      'A.1',
      'A.1.1',
      'A.1.1.1',
      'A.1.1.1.1',
    ]);
  });

  it('a heading-less doc parses to a single slide holding the whole content', () => {
    const deck = parseDeck('Just a paragraph.\n\n- one\n- two\n');
    expect(deck.slides).toHaveLength(1);
    expect(deck.slides[0]!.title).toBe('Untitled');
    expect(deck.slides[0]!.steps).toEqual([
      { markdown: 'Just a paragraph.' },
      { markdown: '- one' },
      { markdown: '- two' },
    ]);
  });

  it('a list contributes one step per item, not one for the whole list', () => {
    const deck = parseDeck('# Title\n\n## Bullets\n\n- alpha\n- beta\n- gamma\n');
    expect(deck.slides[1]!.steps).toEqual([
      { markdown: '- alpha' },
      { markdown: '- beta' },
      { markdown: '- gamma' },
    ]);
  });

  it('GFM tables and code fences land as steps in source order', () => {
    const md = [
      '# Title',
      '',
      '## Mixed',
      '',
      'A paragraph.',
      '',
      '```ts',
      'const x = 1;',
      '```',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n');
    const deck = parseDeck(md);
    const slide = deck.slides[1]!;
    expect(slide.steps).toHaveLength(3);
    expect(slide.steps[0]!.markdown).toBe('A paragraph.');
    expect(slide.steps[1]!.markdown).toBe('```ts\nconst x = 1;\n```');
    expect(slide.steps[2]!.markdown).toBe('| a | b |\n|---|---|\n| 1 | 2 |');
  });

  it('content before the first heading is dropped, matching the crib', () => {
    const deck = parseDeck('Preamble text.\n\n# Title\n\n## A\n\nreal content\n');
    expect(deck.slides[0]!.steps).toEqual([]);
    expect(deck.slides[1]!.steps).toEqual([{ markdown: 'real content' }]);
  });

  it('a heading with leading numbering is cleaned, cover slide is not', () => {
    const deck = parseDeck('# 1. Title\n\n## 2.1 Second\n\ncontent\n');
    expect(deck.slides[0]!.title).toBe('1. Title');
    expect(deck.slides[1]!.title).toBe('Second');
  });
});
