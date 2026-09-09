/**
 * "Midnite Studio" — the brand face for the name, the UI face for the qualifier.
 *
 * The split is the whole point of the component, and it mirrors the app's
 * `Wordmark` (`packages/app/src/components/brand.tsx`) exactly: `Midnite` is the
 * brand and is set in the brand face at `1.35em` with `tracking-wide`; `Studio`
 * says which of midnite's apps this is, so it stays in the UI face at
 * `font-medium` and one muted step back. Setting both in a script face would
 * read as one made-up word.
 *
 * The face itself is **Kaushan Script**, not the app's Quick Kiss. Quick Kiss is
 * licensed for personal use only and can never be served from a public origin;
 * Kaushan Script (OFL) is its closest open re-cut, chosen from twenty rendered
 * candidates. See `docs/WEBSITE.md` and
 * `src/fonts/kaushan-script/README.md`. The two surfaces are deliberately
 * near-identical rather than identical.
 *
 * **Three surfaces render this and none of them spells it out inline**: the
 * nav's `Logo`, the hero headline, and the footer's big wordmark. That is why
 * the size comes from the caller (`1em`-relative throughout, so one `text-*` on
 * the parent scales both halves together) and only the *treatment* is fixed
 * here — a split re-typed in three places is a split that will eventually
 * disagree with itself.
 */

export type WordmarkTone =
  /**
   * The brand's own colours: the rainbow ramp clipped to the glyphs, with the
   * letterform glow behind them. What the wordmark wears when it is standing in
   * for the brand — the nav and the hero.
   */
  | 'rainbow'
  /**
   * No fill and no glow of its own; both words inherit whatever the parent
   * paints. For the footer, whose `<p>` already carries its own deliberately
   * faded ramp and its own `background-clip: text` — a texture at the bottom of
   * the page rather than a mark, and re-fanning the full-strength ramp inside it
   * would undo that.
   */
  | 'inherit';

export type WordmarkProps = {
  /**
   * Which of the two treatments to wear. Defaults to `rainbow`, because that is
   * the wordmark proper; `inherit` is the footer's exception.
   */
  tone?: WordmarkTone;
  className?: string;
  'data-testid'?: string;
};

export const Wordmark = ({
  tone = 'rainbow',
  className = '',
  'data-testid': testId,
}: WordmarkProps) => (
  <span
    data-testid={testId}
    className={`select-none whitespace-nowrap leading-none ${className}`}
  >
    {/*
      `inline-block` on the brand half: `background-clip: text` clips the ramp
      to the glyphs, but the gradient's *box* is still the element's, and an
      inline box that wraps across lines gets one gradient per fragment. It also
      gives `drop-shadow` a box to filter — a filter on a plain inline element is
      applied per line-box, which is the same problem again.

      **`pr-[0.08em]` is not spacing, it is headroom for the clip itself.**
      Kaushan Script's glyphs are wider than their advance: measuring "Midnite"
      on a canvas at the brand face puts its ink about 0.05em past the box
      `inline-block` sizes to (the final `e`'s tail is the culprit). A gradient
      clipped to *text* still only paints inside the *element's* box, so
      without this the tail's overshoot fell outside it and read as the name
      being cut off. `0.08em` clears that with room to spare, in the one unit
      that scales with every size this mark is set at.
    */}
    <span
      className={`inline-block text-[1.35em] tracking-wide pr-[0.08em] ${
        tone === 'rainbow' ? 'ws-rainbow-text ws-brand-glow' : ''
      } font-brand`}
    >
      Midnite
    </span>
    {/*
      **A real space, not only a margin — the mark's `textContent` has to say
      "Midnite Studio".** The app separates the two halves with `ml-1.5` alone,
      which is invisible to everything that reads the DOM: the string comes out
      `MidniteStudio`, and here that would land in the hero's `<h1>` and become
      the page's accessible name. So the space is a text node and the margin is
      only the optical nudge on top of it.

      That nudge is in `em`, not the app's fixed 6px. The app renders this mark
      at one size; the site renders it at three, from 15px in the nav to ~140px
      in the footer, and the brand face's final `e` exits on a long flat stroke
      that grows with the type — a fixed gap that is generous at 15px is a
      collision at 140px.
    */}{' '}
    <span
      className={`ml-[0.08em] font-medium ${tone === 'rainbow' ? 'text-fg-muted' : ''}`}
    >
      Studio
    </span>
  </span>
);
