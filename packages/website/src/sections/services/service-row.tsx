import { LuArrowRight } from 'react-icons/lu';

import { Eyebrow, GlowCard, Heading, Lede } from '../../components';

import type { ServiceRow as Row } from './rows';

export type ServiceRowProps = {
  row: Row;
  /** Even rows put the drawing on the right, odd rows on the left. */
  index: number;
};

/**
 * One outcome, one drawing, alternating sides.
 *
 * **The alternation is `lg:order-*`, not two branches.** The markup order is
 * always copy-then-drawing, which is the order it should be read in when the
 * grid collapses to one column on a phone; only at `lg` does an odd row swap
 * the two. Writing it as `index % 2 ? <a/><b/> : <b/><a/>` would put the
 * drawing above the heading on a narrow screen for half the rows, which is the
 * wrong reading order and invisible on a desktop.
 *
 * The drawing sits in a `bare` `GlowCard` so it gets the site's hairline and
 * bloom with no padding of its own, and the SVG fills it.
 */
export const ServiceRow = ({ row, index }: ServiceRowProps) => {
  const { id, eyebrow, title, body, how, Art } = row;
  const flip = index % 2 === 1;
  const headingId = `service-${id}-title`;

  return (
    <article
      aria-labelledby={headingId}
      className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
    >
      <div className={`flex flex-col gap-4 ${flip ? 'lg:order-2' : ''}`}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading level={3} id={headingId} className="text-2xl sm:text-3xl" typeIn>
          {title}
        </Heading>
        <Lede typeIn>{body}</Lede>

        <div className="mt-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
            How it works
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {how.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-fg-muted">
                <LuArrowRight aria-hidden className="mt-1 size-3.5 shrink-0 text-accent" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <GlowCard bare className={`aspect-[16/10] w-full ${flip ? 'lg:order-1' : ''}`}>
        <Art />
      </GlowCard>
    </article>
  );
};
