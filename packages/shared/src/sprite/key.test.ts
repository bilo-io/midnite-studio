import { describe, expect, it } from 'vitest';

import { discOn } from './test-fixtures';
import { chooseChroma, chromaPromptClause, keyChroma, spriteBackgroundRequest, SPRITE_CHROMA_GREEN, SPRITE_CHROMA_MAGENTA } from './key';

describe('keyChroma', () => {
  const keyed = keyChroma(discOn(48, 24, 24, 12, '#e02020', SPRITE_CHROMA_MAGENTA), SPRITE_CHROMA_MAGENTA);
  const at = (x: number, y: number) => Array.from(keyed.data.slice((y * 48 + x) * 4, (y * 48 + x) * 4 + 4));

  it('clears the background and keeps the subject opaque', () => {
    expect(at(1, 1)[3]).toBe(0);
    expect(at(47, 47)[3]).toBe(0);
    expect(at(24, 24)[3]).toBe(255);
    expect(at(24, 15)[3]).toBe(255);
  });

  it('leaves no magenta fringe on any visible pixel', () => {
    for (let i = 0; i < keyed.data.length; i += 4) {
      if (keyed.data[i + 3] === 0) continue;
      const [r, g, b] = [keyed.data[i]!, keyed.data[i + 1]!, keyed.data[i + 2]!];
      expect(Math.min(r, b) - g).toBeLessThanOrEqual(0.1 * 255);
    }
  });

  it('keys a green background without eating a pink subject', () => {
    const pink = keyChroma(discOn(32, 16, 16, 8, '#ff60c0', SPRITE_CHROMA_GREEN), SPRITE_CHROMA_GREEN);
    expect(pink.data[(16 * 32 + 16) * 4 + 3]).toBe(255);
    expect(pink.data[3]).toBe(0);
    for (let i = 0; i < pink.data.length; i += 4) {
      if (pink.data[i + 3] === 0) continue;
      expect(pink.data[i + 1]! - Math.max(pink.data[i]!, pink.data[i + 2]!)).toBeLessThanOrEqual(0);
    }
  });
});

describe('chooseChroma', () => {
  it('is green for magenta-ish prompts and palettes, magenta otherwise', () => {
    expect(chooseChroma('a pink dragon')).toBe(SPRITE_CHROMA_GREEN);
    expect(chooseChroma('A PURPLE wizard')).toBe(SPRITE_CHROMA_GREEN);
    expect(chooseChroma('a red knight')).toBe(SPRITE_CHROMA_MAGENTA);
    expect(chooseChroma('a knight', ['#000000', '#f010f0'])).toBe(SPRITE_CHROMA_GREEN);
    expect(chooseChroma('a knight', ['#000000', '#3060c0'])).toBe(SPRITE_CHROMA_MAGENTA);
  });

  it('asks OpenAI for real alpha and every other provider for a chroma clause', () => {
    expect(spriteBackgroundRequest('openai', 'a knight')).toEqual({ transparent: true, clause: '' });
    const gemini = spriteBackgroundRequest('gemini', 'a pink knight');
    expect(gemini).toMatchObject({ transparent: false, chroma: SPRITE_CHROMA_GREEN });
    expect(gemini.clause).toBe(chromaPromptClause(SPRITE_CHROMA_GREEN));
    expect(chromaPromptClause(SPRITE_CHROMA_MAGENTA)).toContain('#ff00ff');
  });
});
