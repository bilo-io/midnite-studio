// L1 (Phase 146 Theme L): the app names no colour. Every colour comes from `useTheme()`, so both schemes and any
// future token change reach every screen. Scans apps/mobile/{app,src}; the vendored UI kit and test mocks stay out.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = import.meta.dirname ? join(import.meta.dirname, '..') : process.cwd();

const NAMED = 'white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|teal|cyan|navy|silver|transparent';
const PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'hex literal', re: /#[0-9a-fA-F]{3,8}\b/ },
  { label: 'rgb()/rgba() literal', re: /\brgba?\(/ },
  { label: 'hsl()/hsla() literal', re: /\bhsla?\(/ },
  {
    label: 'named colour as a style value',
    re: new RegExp(`\\b[a-zA-Z]*[cC]olor\\s*:\\s*['"\`](?:${NAMED})['"\`]`),
  },
];

export function findColorLiterals(source: string): { line: number; label: string; text: string }[] {
  const hits: { line: number; label: string; text: string }[] = [];
  source.split('\n').forEach((text, i) => {
    // A URL fragment (`…/path#abc`) or comment line is not a style value.
    const code = text.replace(/^\s*(\/\/|\*|\/\*).*$/, '').replace(/https?:\/\/\S+/g, '');
    for (const { label, re } of PATTERNS) if (re.test(code)) hits.push({ line: i + 1, label, text: text.trim() });
  });
  return hits;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('no ad-hoc colours', () => {
  it('detects each literal kind', () => {
    expect(findColorLiterals("const a = '#fff';")).toHaveLength(1);
    expect(findColorLiterals("const a = 'rgba(0,0,0,.5)';")).toHaveLength(1);
    expect(findColorLiterals("const a = 'hsl(1 2% 3%)';")).toHaveLength(1);
    expect(findColorLiterals("style={{ backgroundColor: 'white' }}")).toHaveLength(1);
    expect(findColorLiterals('const a = theme.colors.background;')).toHaveLength(0);
    expect(findColorLiterals('// see #1368')).toHaveLength(0);
  });

  it('apps/mobile/{app,src} contains none', () => {
    const files = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'src'))];
    const offenders = files.flatMap((f) =>
      findColorLiterals(readFileSync(f, 'utf8')).map((h) => `${relative(ROOT, f)}:${h.line} ${h.label}: ${h.text}`),
    );
    expect(offenders).toEqual([]);
  });
});
