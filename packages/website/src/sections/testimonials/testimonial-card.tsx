import { LuGithub, LuMail, LuMessageSquare, LuQuote } from 'react-icons/lu';

import { GlowCard } from '../../components';
import { assetHref } from '../../routes';

import type { Testimonial, TestimonialSource } from './testimonial';

/** The glyph and the name for each channel a quote can come from. */
const SOURCE_MARKS: Record<TestimonialSource, { Icon: typeof LuGithub; label: string }> = {
  slack: { Icon: LuMessageSquare, label: 'Slack' },
  github: { Icon: LuGithub, label: 'GitHub' },
  email: { Icon: LuMail, label: 'Email' },
};

export type TestimonialCardProps = { testimonial: Testimonial };

/**
 * One quote, with the original message behind it when there is a screenshot.
 *
 * **The tilted frame is doing a job, not a trick.** A screenshot of a Slack
 * message pasted flat into a marketing page reads as a design element — a
 * mock-up someone drew. Set in a window frame with a title bar and the source's
 * own glyph, tilted a couple of degrees as though it were dropped on the page,
 * it reads as a screenshot: evidence rather than illustration. That distinction
 * is the entire reason the field exists.
 *
 * The tilt is a static `rotate`, not an animation, so it needs no reduced-motion
 * branch — there is nothing in motion to reduce.
 *
 * `assetHref` and never a hard-coded `/`: the deployed site is served under
 * `/midnite-apps/midnite-studio/`, so a leading slash 404s in production and
 * works perfectly in dev, which is the worst way for a bug to behave.
 */
export const TestimonialCard = ({ testimonial }: TestimonialCardProps) => {
  const { quote, name, role, avatar, source, screenshot } = testimonial;
  const mark = source ? SOURCE_MARKS[source] : undefined;

  return (
    <GlowCard className="flex h-full flex-col gap-5">
      <LuQuote aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" />

      <blockquote className="flex-1 text-base leading-relaxed text-fg sm:text-lg">
        {quote}
      </blockquote>

      {screenshot ? (
        <figure
          className="overflow-hidden rounded-md border border-line bg-bg-sunken shadow-glow-soft"
          style={{ transform: 'rotate(-2.25deg)' }}
        >
          <figcaption className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-fg-subtle">
            {mark ? <mark.Icon aria-hidden="true" className="h-3.5 w-3.5" /> : null}
            <span>{mark ? mark.label : 'Screenshot'}</span>
          </figcaption>
          <img
            src={assetHref(screenshot)}
            alt={`The original message from ${name}`}
            loading="lazy"
            className="block w-full"
          />
        </figure>
      ) : null}

      <figcaption className="flex items-center gap-3">
        {avatar ? (
          <img
            src={assetHref(avatar)}
            alt=""
            loading="lazy"
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : null}
        <span className="flex flex-col">
          <cite className="text-sm font-medium not-italic text-fg">{name}</cite>
          <span className="text-xs text-fg-subtle">{role}</span>
        </span>
        {mark && !screenshot ? (
          <span
            className="ml-auto flex items-center gap-1.5 text-xs text-fg-subtle"
            title={`Said in ${mark.label}`}
          >
            <mark.Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {mark.label}
          </span>
        ) : null}
      </figcaption>
    </GlowCard>
  );
};
