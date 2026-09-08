/** Where a quote came from — decides which glyph a screenshot's frame wears. */
export const SOURCES = ['slack', 'github', 'email'] as const;
export type TestimonialSource = (typeof SOURCES)[number];

export type Testimonial = {
  /** What they said, verbatim. No paraphrasing, no tightening. */
  quote: string;
  /** Who said it. */
  name: string;
  /** Their role, or where they said it from. */
  role: string;
  /** A path under `public/`, relative — `img/testimonials/<file>`. */
  avatar?: string;
  /** Which channel it came from. Omit it if you would rather not say. */
  source?: TestimonialSource;
  /** A path under `public/` to a screenshot of the original message. */
  screenshot?: string;
};

/** The file a human edits to add one. Quoted in the empty state, verbatim. */
export const TESTIMONIALS_PATH = 'src/sections/testimonials/testimonials.json';

/** Where the images live. Also quoted in the empty state. */
export const TESTIMONIALS_IMG_DIR = 'public/img/testimonials/';

const isSource = (value: unknown): value is TestimonialSource =>
  typeof value === 'string' && (SOURCES as readonly string[]).includes(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

/**
 * Read `testimonials.json` into typed entries, dropping anything malformed.
 *
 * **Why a parser and not a typed JSON import.** `resolveJsonModule` would give
 * this for free — except that TypeScript widens a JSON string literal to
 * `string`, so the first entry anyone adds with `"source": "slack"` fails
 * `typecheck` with a variance error about a file that is perfectly correct. The
 * file is meant to be hand-edited by whoever collects the quote, and a
 * hand-edited file that breaks the build is a file nobody edits.
 *
 * **Skipping rather than throwing** is the same argument one step further. A
 * typo in one entry must not take the section — or the build — down with it;
 * the quote simply does not appear, and the placeholder cards come back if that
 * was the only one. `quote`, `name` and `role` are the three fields a card
 * cannot be drawn without, so an entry missing any of them is not an entry.
 *
 * What this function will never do is invent anything. There is no default
 * name, no "Anonymous", no sample quote — see the section's own docblock.
 */
export const parseTestimonials = (raw: unknown): Testimonial[] => {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item): Testimonial[] => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;

    const quote = optionalString(record['quote']);
    const name = optionalString(record['name']);
    const role = optionalString(record['role']);
    if (!quote || !name || !role) return [];

    const source = record['source'];
    return [
      {
        quote,
        name,
        role,
        ...(optionalString(record['avatar']) ? { avatar: record['avatar'] as string } : {}),
        ...(isSource(source) ? { source } : {}),
        ...(optionalString(record['screenshot'])
          ? { screenshot: record['screenshot'] as string }
          : {}),
      },
    ];
  });
};
