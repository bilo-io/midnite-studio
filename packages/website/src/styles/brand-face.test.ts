import { describe, expect, it } from 'vitest';

/**
 * The regression guard for the brand face's wiring.
 *
 * The face is five files that have to agree and have no compiler between them:
 * the woff2 itself, the `@font-face` in `site.css`, the `--font-brand` token
 * beside it, `tailwind.config.ts`'s `fontFamily.brand`, and a `<link
 * rel=preload>` in **both** HTML entries. Swapping the face — Kaushan Script to
 * Damion, say — means editing all of them, and every way of getting it half
 * done fails silently: a stale preload downloads a file nothing uses and the
 * real one is still discovered three round trips late, a `--font-brand` that
 * names a family no `@font-face` declares falls straight through to `cursive`,
 * and a `url()` pointing at a deleted file makes Vite's build fail only if
 * someone runs it. None of that shows up in a rendering test, because the DOM
 * is identical in every one of those states.
 *
 * So this file reads the shipped sources and checks they still name one face
 * and one file. It deliberately does not assert *which* face — that is a design
 * decision, and pinning "Damion" here would mean a face swap fails a test whose
 * subject is the wiring.
 *
 * The two licence assertions are the exception, and they are not stylistic:
 * `packages/app`'s Quick Kiss is licensed for personal use only and must never
 * reach this public package, and the OFL requires upstream's licence file to
 * ship beside any subset of the font. See `docs/WEBSITE.md` § "The brand face".
 */

const SOURCES: Record<string, string> = import.meta.glob<string>(
  ['../**/*.{ts,tsx,css}', '../../index.html', '../../download/index.html'],
  { eager: true, query: '?raw', import: 'default' },
);

/** Every file under `src/fonts/`, by path — the shipped face and its licence. */
const FONT_FILES = Object.keys(import.meta.glob('../fonts/**/*'));

/** Glob keys are relative to *this* file, which sits in `src/styles/`. */
const read = (key: string): string => {
  const source = SOURCES[key];
  if (source === undefined) throw new Error(`no source at ${key}`);
  return source;
};

const siteCss = read('./site.css');

/**
 * The `@font-face` blocks in `site.css`, as `{ family, url }`. A block missing
 * either is a malformed declaration, so it throws here rather than widening
 * every assertion below to tolerate `undefined`.
 */
const faces = [...siteCss.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => {
  const body = match[1] ?? '';
  const family = /font-family:\s*'([^']+)'/.exec(body)?.[1];
  const url = /url\('([^']+)'\)/.exec(body)?.[1];
  if (!family || !url) throw new Error(`@font-face without a family or a url: ${body}`);
  return { family, url };
});

/** The one face, or a failure naming how many there were instead. */
const brandFace = () => {
  expect(faces).toHaveLength(1);
  const [face] = faces;
  if (!face) throw new Error('unreachable');
  return face;
};

describe('the brand face', () => {
  it('declares exactly one @font-face, and --font-brand names that family', () => {
    const face = brandFace();

    // `--font-brand: '<family>', cursive` — the generic fallback is a script
    // too, so the swap does not flash a different kind of letter.
    const token = /--font-brand:\s*'([^']+)',\s*cursive;/.exec(siteCss)?.[1];
    expect(token).toBe(face.family);
  });

  it('points at a file that is actually in the package, beside its OFL licence', () => {
    const face = brandFace();
    // `url('../fonts/damion/Damion-latin.woff2')` is relative to `src/styles/`;
    // the glob keys are relative to this file, which lives there too.
    expect(FONT_FILES).toContain(face.url);

    const dir = face.url.slice(0, face.url.lastIndexOf('/'));
    expect(FONT_FILES).toContain(`${dir}/OFL.txt`);
  });

  it('is preloaded by source path from both HTML entries, and only it', () => {
    const face = brandFace();
    // The `@font-face` url is relative to `src/styles/`; the preload `href` is
    // root-absolute from the package. Same file, two spellings.
    const href = face.url.replace('../', '/src/');

    for (const entry of ['../../index.html', '../../download/index.html']) {
      const html = read(entry);
      const preloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)].map(([tag]) => tag);

      expect(preloads).toHaveLength(1);
      expect(preloads[0]).toContain(`href="${href}"`);
      // A font preload is CORS-mode even same-origin; without this attribute
      // the preloaded copy is never matched and the font downloads twice.
      expect(preloads[0]).toContain('crossorigin');
    }
  });

  it('makes no third-party request for its type', () => {
    for (const [path, source] of Object.entries(SOURCES)) {
      if (path.endsWith('brand-face.test.ts')) continue;
      expect(source, path).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    }
  });

  it('never reaches for the app\'s personal-use face', () => {
    // Quick Kiss is licensed for personal use only. The private app is
    // arguably within that; this package is public marketing and is not.
    //
    // A *reference* is what this looks for, not the string: `site.css` and the
    // font directory's README both name the file in the comment that forbids
    // it, and a check that failed on those would be a check people delete the
    // warnings to satisfy.
    for (const [path, source] of Object.entries(SOURCES)) {
      expect(source, path).not.toMatch(/(?:url\(|from\s*)['"][^'"]*quick-kiss/i);
    }
    expect(FONT_FILES.some((file) => file.includes('quick-kiss'))).toBe(false);
  });
});
