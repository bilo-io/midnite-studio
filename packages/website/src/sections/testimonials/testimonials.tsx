import { Eyebrow, Heading, Lede, Reveal, Section } from '../../components';

import raw from './testimonials.json';
import { parseTestimonials, type Testimonial } from './testimonial';
import { TestimonialCarousel } from './testimonial-carousel';
import { TestimonialEmpty } from './testimonial-empty';

/** The file's contents, parsed once at module load. */
export const TESTIMONIALS: readonly Testimonial[] = parseTestimonials(raw);

export type TestimonialsProps = {
  /**
   * Overridable for tests and for a fixture render. Production passes nothing
   * and gets `testimonials.json`.
   */
  testimonials?: readonly Testimonial[];
};

/**
 * What people have said — and, until anyone has, an honest account of that.
 *
 * **`testimonials.json` ships empty, and that is the deliverable.** The one
 * thing this section must never do is carry a quote nobody said. A plausible
 * placeholder — "Midnite Studio changed how our team ships", A. Developer,
 * Staff Engineer — is indistinguishable from a real testimonial to a visitor
 * and indistinguishable from finished work to whoever ships the site, which is
 * exactly how invented copy survives to production. So the empty state is
 * conspicuous instead: dashed cards, the file path in monospace, the schema
 * printed inline. See `TestimonialEmpty`.
 *
 * When entries exist the section switches to the carousel without any other
 * change — the heading, the lede and the anchor are the same, so adding the
 * first quote is a JSON edit and nothing else.
 *
 * The registry keeps this section's wave-1 label, "Notes".
 */
export const Testimonials = ({ testimonials = TESTIMONIALS }: TestimonialsProps) => (
  <Section id="testimonials" label="Notes">
    <Reveal>
      <div className="flex flex-col gap-4">
        <Eyebrow>Notes from the build</Eyebrow>
        <Heading level={2} typeIn>
          What people say
        </Heading>
        <Lede typeIn>
          Midnite Studio is early, and this is the section that says so. Nothing below is
          written by us on someone else&rsquo;s behalf — when there is a quote, it is
          verbatim, with the original message attached where there is one.
        </Lede>
      </div>
    </Reveal>

    <div className="mt-10 sm:mt-12">
      {testimonials.length === 0 ? (
        <TestimonialEmpty />
      ) : (
        <TestimonialCarousel testimonials={testimonials} />
      )}
    </div>
  </Section>
);
