import logoUrl from '../assets/logo.png';

/**
 * The midnite crescent and wordmark.
 *
 * Both come straight from the midnite app: the mark is its `logo.PNG`, and the
 * wordmark is set in Quick Kiss, midnite's brand face. Sharing the assets rather
 * than approximating them is the point — this is the same product family, and a
 * near-miss logo reads worse than none.
 *
 * midnite's own <Wordmark> carries a live font/case/size picker for trialling
 * faces; that machinery is deliberately not copied. Here the brand is settled,
 * so it is one face and one spelling.
 */

/**
 * The crescent, treated as midnite treats it: a rounded coin with a hairline
 * ring.
 *
 * Rendered as an image, not a CSS mask. The source is an *opaque* disc — a black
 * crescent on a white ground, transparent only outside the circle — so a mask
 * (which reads only the alpha channel) flattens it to a featureless dot. The
 * white ground is deliberate; it is what makes one asset work on both themes,
 * and the ring keeps it from floating on a light surface.
 */
export function BrandMark({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <img
      src={logoUrl}
      alt=""
      aria-hidden
      draggable={false}
      className={`${className} shrink-0 select-none rounded-full object-cover ring-1 ring-border/60`}
    />
  );
}

/**
 * "Midnite Studio" — the brand face for the name, the UI face for the qualifier.
 *
 * The two words are weighted differently on purpose: `Midnite` is the brand and
 * is set in Quick Kiss, the same face the midnite app uses for its own wordmark
 * (`WORDMARK_LOGO_FONT` there). `Studio` says which of its apps this is, so it
 * stays in the UI face — setting both in the display face would read as one
 * made-up word.
 *
 * Matches the display name everywhere else: electron-builder's `productName`,
 * `app.setName`, and the document title.
 */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`select-none whitespace-nowrap leading-none ${className}`}>
      <span className="font-brand text-[1.35em] tracking-wide">Midnite</span>
      <span className="ml-1.5 font-medium text-muted-foreground">Studio</span>
    </span>
  );
}

/** Mark + wordmark, the pairing used in the rail and the title bar. */
export function Brand({
  className = '',
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <BrandMark />
      {showWordmark ? <Wordmark className="text-sm" /> : null}
    </span>
  );
}
