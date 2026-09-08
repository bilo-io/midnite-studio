import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Logo } from './logo';
import { Wordmark } from './wordmark';

/**
 * What is worth asserting about a wordmark is not how it looks — it is that the
 * *split* survives. The brand half and the qualifier half are two elements with
 * two different faces, and every regression this component could have is one of
 * them quietly merging into the other: the whole string ending up in the script
 * face (which reads as one made-up word), the brand half losing `font-brand`
 * back to the UI sans, or a treatment class drifting onto the wrong half so the
 * gradient clips "Studio" instead.
 *
 * So the tests reach for the two spans and check which classes are on which.
 * Named utilities rather than a snapshot: the spacing around them changes with
 * layout, and a snapshot here would fail on every unrelated tweak while
 * catching none of the above. `classList.contains` rather than
 * `toHaveClass` — this suite has no jest-dom, deliberately.
 */

const brandHalf = () => screen.getByText('Midnite');
const qualifierHalf = () => screen.getByText('Studio');

describe('Wordmark', () => {
  it('splits the name from the qualifier, and sets only the name in the brand face', () => {
    render(<Wordmark />);

    // Two elements, not one string — the split itself.
    expect(brandHalf()).not.toBe(qualifierHalf());
    expect(brandHalf().classList.contains('font-brand')).toBe(true);
    expect(qualifierHalf().classList.contains('font-brand')).toBe(false);
    expect(qualifierHalf().classList.contains('font-medium')).toBe(true);
  });

  it('reads as "Midnite Studio" to anything that takes the text content', () => {
    // The space between the halves is a real text node, not only the optical
    // margin: this string is the hero <h1>'s accessible name, and a CSS-only
    // gap would make that "MidniteStudio is …".
    render(<Wordmark data-testid="mark" />);

    expect(screen.getByTestId('mark').textContent).toBe('Midnite Studio');
  });

  it('puts the rainbow fill and the letterform glow on the name, and only the name', () => {
    render(<Wordmark />);

    expect(brandHalf().classList.contains('ws-rainbow-text')).toBe(true);
    expect(brandHalf().classList.contains('ws-brand-glow')).toBe(true);
    expect(qualifierHalf().classList.contains('ws-rainbow-text')).toBe(false);
    expect(qualifierHalf().classList.contains('ws-brand-glow')).toBe(false);
  });

  it('drops both treatments under tone="inherit", keeping the face split', () => {
    // The footer's case: its own <p> owns the ramp and the background-clip, so a
    // second full-strength ramp inside it would undo the fade that is the whole
    // point of that mark.
    render(<Wordmark tone="inherit" />);

    expect(brandHalf().classList.contains('font-brand')).toBe(true);
    expect(brandHalf().classList.contains('ws-rainbow-text')).toBe(false);
    expect(brandHalf().classList.contains('ws-brand-glow')).toBe(false);
    expect(qualifierHalf().classList.contains('text-fg-muted')).toBe(false);
  });

  it('is what the nav renders, without disturbing the accessible name', () => {
    // The mark is decoration with a text fallback; the nav's own aria-label is
    // what a screen reader announces, and it must still say the product's name
    // even though the visible name is now two differently-faced spans.
    render(
      <a href="/" aria-label="Midnite Studio">
        <Logo />
      </a>,
    );

    expect(screen.getByRole('link', { name: 'Midnite Studio' })).toBeTruthy();
    expect(brandHalf().classList.contains('font-brand')).toBe(true);
  });
});
