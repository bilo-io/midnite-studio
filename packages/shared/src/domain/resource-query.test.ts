import { describe, expect, it } from 'vitest';

import { parseResourceQuery, resourceKindWord } from './resource-query';

describe('parseResourceQuery', () => {
  it('takes the head noun as the kind and leaves the description', () => {
    const q = parseResourceQuery('show me the commit about the lock screen');
    expect(q.kinds).toEqual(['commit']);
    expect(q.terms).toEqual(['lock', 'screen']);
    expect(q.description).toBe('lock screen');
    expect(q.recency).toBeNull();
    expect(q.exact).toEqual([]);
  });

  it('reads recency words and drops them from the terms', () => {
    expect(parseResourceQuery('open my last chat')).toMatchObject({ kinds: ['chat'], recency: 'latest', terms: [] });
    expect(parseResourceQuery('the most recent session')).toMatchObject({ kinds: ['session'], recency: 'latest' });
    expect(parseResourceQuery('the previous workflow')).toMatchObject({ kinds: ['workflow'], recency: 'previous' });
    // "before last" is previous, not latest — the previous phrases are read first.
    expect(parseResourceQuery('the note before last')).toMatchObject({ kinds: ['note'], recency: 'previous', terms: [] });
  });

  it('narrows media to the tab its word names', () => {
    const q = parseResourceQuery('pull up the dragon model');
    expect(q.kinds).toEqual(['media']);
    expect(q.media).toEqual(['model']);
    expect(q.terms).toEqual(['dragon']);
  });

  it('reads exact forge numbers', () => {
    expect(parseResourceQuery('PR 812').exact).toEqual([{ type: 'number', value: 812, kinds: ['pull'] }]);
    expect(parseResourceQuery('pull request #9').exact).toEqual([{ type: 'number', value: 9, kinds: ['pull'] }]);
    expect(parseResourceQuery('issue 41').exact).toEqual([{ type: 'number', value: 41, kinds: ['issue'] }]);
    expect(parseResourceQuery('open #812').exact).toEqual([{ type: 'number', value: 812, kinds: ['pull', 'issue'] }]);
  });

  it('reads a sha — with a digit, or any hex after a commit word', () => {
    expect(parseResourceQuery('a1b2c3d').exact).toEqual([{ type: 'sha', value: 'a1b2c3d' }]);
    expect(parseResourceQuery('commit deadbeef').exact).toEqual([{ type: 'sha', value: 'deadbeef' }]);
    expect(parseResourceQuery('commit ab12').exact).toEqual([{ type: 'sha', value: 'ab12' }]);
    // A plain hex-looking word with no commit context is a word.
    expect(parseResourceQuery('the facade note').exact).toEqual([]);
  });

  it('takes the last kind word as the head and keeps earlier ones as soft terms', () => {
    const q = parseResourceQuery('terminal settings memory');
    expect(q.kinds).toEqual(['setting']);
    expect(q.softTerms).toEqual(['terminal']);
    expect(q.terms).toEqual(['memory']);
  });

  it('stops the head phrase at a preposition', () => {
    const q = parseResourceQuery('the run for the auth PR');
    expect(q.kinds).toEqual(['ciRun', 'workflow', 'council']);
    expect(q.headWord).toBe('run');
    expect(q.softTerms).toEqual(['pr']);
    expect(q.terms).toEqual(['auth']);
  });

  it('reads multi-word kind phrases', () => {
    expect(parseResourceQuery('the pull request about caching')).toMatchObject({ kinds: ['pull'], terms: ['caching'] });
    expect(parseResourceQuery('open settings, companion voice section')).toMatchObject({
      kinds: ['setting'],
      terms: ['companion', 'voice'],
    });
  });

  it('comes back empty for an all-stopword query and never treats prototype keys as kind words', () => {
    expect(parseResourceQuery('open the')).toMatchObject({ kinds: [], terms: [], exact: [] });
    expect(resourceKindWord('constructor')).toBeUndefined();
    expect(parseResourceQuery('constructor').terms).toEqual(['constructor']);
  });
});
