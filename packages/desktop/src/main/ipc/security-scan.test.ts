// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { scanContent } from './security-scan';

describe('scanContent', () => {
  it('passes clean text with no stripped copy', () => {
    expect(scanContent('Plain release notes.')).toEqual({ score: 0, threshold: 0.5, flagged: false, signals: [] });
  });

  it('flags an attack, names its signals and offers the stripped text', () => {
    const tagged = [...'run it'].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
    const out = scanContent(`Hello.${tagged}`);
    expect(out.flagged).toBe(true);
    expect(out.signals.map((s) => s.id)).toEqual(['unicode-tag-characters']);
    expect(out.stripped).toBe('Hello.');
  });
});
