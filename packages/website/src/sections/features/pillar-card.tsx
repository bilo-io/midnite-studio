import { GlowCard } from '../../components';

import type { Pillar } from './pillars';

export type PillarCardProps = {
  pillar: Pillar;
  /** Ties the card's title to the segment control button that reveals it. */
  headingId: string;
};

/**
 * One pillar: a glowing card, a lane-coloured mark, and its claims as a list.
 *
 * The card is a `<GlowCard>` in the pillar's own lane colour and is deliberately
 * **not** `interactive` — nothing here is clickable, and a card that lifts under
 * the cursor promises a click it cannot honour.
 *
 * The bullets are a real `<ul>`, with the glyph inside the `<li>` and marked
 * `aria-hidden`: it repeats the title next to it, so announcing it would make a
 * screen reader read every bullet twice. `h-full` on the card matters at the
 * three-column breakpoint — grid items stretch, the card's background does not
 * unless it is told to fill them, and three cards of unequal copy would
 * otherwise sit on three different card heights.
 */
export const PillarCard = ({ pillar, headingId }: PillarCardProps) => {
  const { Icon, name, lede, glow, tint, bullets } = pillar;

  return (
    <GlowCard glow={glow} className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex size-10 shrink-0 items-center justify-center rounded-md bg-bg-sunken text-xl ${tint}`}
        >
          <Icon />
        </span>
        <h3 id={headingId} className="text-xl font-semibold text-fg">
          {name}
        </h3>
      </div>

      <p className="text-sm leading-relaxed text-fg-muted">{lede}</p>

      <ul className="flex flex-col gap-4 border-t border-line pt-5">
        {bullets.map(({ Icon: BulletIcon, title, body }) => (
          <li key={title} className="flex gap-3">
            <BulletIcon aria-hidden className={`mt-0.5 size-4 shrink-0 ${tint}`} />
            <span>
              <span className="block text-sm font-medium text-fg">{title}</span>
              <span className="block text-sm leading-relaxed text-fg-subtle">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </GlowCard>
  );
};
