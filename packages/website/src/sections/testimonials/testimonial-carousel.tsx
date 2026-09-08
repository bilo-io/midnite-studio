import { useState } from 'react';
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import { TestimonialCard } from './testimonial-card';
import type { Testimonial } from './testimonial';

export type TestimonialCarouselProps = { testimonials: readonly Testimonial[] };

/**
 * The quotes, one at a time, with the whole set reachable.
 *
 * **A scroll container, not a transform.** The cards live in a real
 * `overflow-x` strip with `scroll-snap`, so a trackpad swipe, a shift-wheel, a
 * touch drag and the arrow buttons all work without any of them being
 * implemented — and the strip is keyboard-scrollable and screen-reader-linear
 * for free. A `translateX` carousel would have had to reimplement every one of
 * those, and would have hidden the off-screen cards from find-in-page.
 *
 * **No auto-advance.** A quote that slides away while it is being read is worse
 * than a quote nobody clicks to. Nothing here moves unless the visitor moves
 * it, which also means the component needs no reduced-motion branch: the only
 * animation is the browser's own smooth scroll, which `tokens.css` cannot zero
 * but `scroll-behavior: auto !important` under the reduced-motion query
 * already does.
 *
 * The arrows are `<button>`s that scroll the strip, and they are hidden
 * outright when there is only one card — a control that cannot do anything is
 * worse than no control.
 */
export const TestimonialCarousel = ({ testimonials }: TestimonialCarouselProps) => {
  const [strip, setStrip] = useState<HTMLUListElement | null>(null);
  const many = testimonials.length > 1;

  /**
   * Scroll by one card. Read off the first child's width rather than a constant
   * so it stays right across the two breakpoints, and it is a one-off read on a
   * click — not the per-frame layout read the marquee is careful to avoid.
   */
  const nudge = (direction: -1 | 1) => {
    if (!strip) return;
    const card = strip.firstElementChild;
    const step = card instanceof HTMLElement ? card.offsetWidth + 16 : strip.clientWidth;
    strip.scrollBy({ left: step * direction, behavior: 'smooth' });
  };

  return (
    <div data-testid="testimonials-carousel" className="flex flex-col gap-4">
      <ul
        ref={setStrip}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {testimonials.map((testimonial) => (
          <li
            key={`${testimonial.name}-${testimonial.quote.slice(0, 24)}`}
            className="w-[min(100%,28rem)] shrink-0 snap-start"
          >
            <TestimonialCard testimonial={testimonial} />
          </li>
        ))}
      </ul>

      {many ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label="Previous testimonial"
            className="rounded-full border border-line-strong p-2 text-fg-muted transition duration-base hover:border-accent hover:text-accent"
          >
            <LuChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label="Next testimonial"
            className="rounded-full border border-line-strong p-2 text-fg-muted transition duration-base hover:border-accent hover:text-accent"
          >
            <LuChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
};
