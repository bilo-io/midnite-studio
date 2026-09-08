import { LuArrowDownToLine, LuTerminal } from 'react-icons/lu';

import { Button, Container, Eyebrow, Logo, Section, Wordmark } from '../../components';
import { anchorHref, hrefFor } from '../../routes';

import { HeroBackdrop } from './hero-backdrop';
import { HeroVideo } from './hero-video';
import { Typewriter } from './typewriter';

/**
 * The phrases the headline types through.
 *
 * Each names one thing the app actually is, in the order `README.md` presents
 * them, and the last one is the claim the other three add up to. Keep them
 * short: the line reserves the width of the longest, so a sentence here costs
 * the whole hero a wider empty box.
 */
const PHRASES = [
  'Your git client.',
  "Your agents' workbench.",
  'Your browser, docked.',
  'One window.',
] as const;

/**
 * The hero.
 *
 * Three layers, back to front: a CSS radial gradient painted on the section
 * (which is the entire backdrop under reduced motion), the pointer-reactive
 * lane graph on a canvas over it, and the copy. Everything in the copy layer
 * sits above a `pointer-events-none` canvas, so the CTAs are ordinary
 * clickable elements and the graph still tracks the cursor across them.
 *
 * `bare` on the `Section`, because this one owns its own height and padding —
 * it is the only band on the page that does.
 */
export const Hero = () => (
  <Section id="hero" label="Midnite Studio" bare className="relative isolate overflow-hidden">
    {/*
      The still backdrop. Two radial gradients rather than one so the accent
      pools behind the headline and fades before the fold, instead of tinting
      the whole viewport evenly. This is what a reduced-motion visitor sees.
    */}
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10"
      style={{
        background:
          'radial-gradient(ellipse 90% 70% at 20% 0%, var(--ws-accent-soft) 0%, transparent 60%),' +
          'radial-gradient(ellipse 70% 60% at 85% 15%, var(--ws-bg-elevated) 0%, transparent 65%)',
      }}
    />
    <HeroBackdrop />

    <Container className="relative pb-20 pt-28 sm:pb-28 sm:pt-36">
      <div className="flex flex-col items-start gap-6">
        {/* The halo is a box-shadow on a round box rather than a
            `drop-shadow` filter: the mark is a silhouette that `.ws-logo-mark`
            already inverts with a filter, and stacking a second one on it
            re-rasterises the image on every frame of the pulse. */}
        <Logo size={44} markOnly className="ws-neon rounded-full" />

        <Eyebrow>Desktop · macOS on Apple silicon</Eyebrow>

        {/*
          The headline names the product and then says what it is, so the
          product half is the wordmark proper — brand face, rainbow fill, glow —
          and only the trailing "is" is headline sans. `text-fg-muted` on that
          one word rather than on the line: it is a hinge into the typewriter
          below it, and the mark it hangs off should not be dimmed with it.

          The whole line stays one `<h1>`, so the page still has exactly one
          level-1 heading and it still reads "Midnite Studio is …".
        */}
        <h1 className="text-4xl font-semibold tracking-tight text-fg sm:text-6xl">
          <span className="block">
            <Wordmark />
            <span className="ml-[0.2em] text-fg-muted">is</span>
          </span>
          <Typewriter phrases={PHRASES} className="text-accent" />
        </h1>

        <p className="max-w-prose text-base leading-relaxed text-fg-muted sm:text-lg">
          A desktop workspace for the whole loop around a repository: an interactive commit
          graph, worktrees nested under the repositories they belong to, your real login
          shell, and the forge — pull requests, checks, reviews — in the same window. The
          UI follows the repository live, so a commit made in the terminal shows up in the
          graph without a refresh.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button href={hrefFor('download')} size="lg" icon={<LuArrowDownToLine />}>
            Download
          </Button>
          <Button href={anchorHref('early-access')} variant="ghost" size="lg">
            Get early access
          </Button>
        </div>

        <p className="flex items-center gap-2 text-sm text-fg-subtle">
          <LuTerminal aria-hidden="true" className="shrink-0" />
          <span>
            Git is the real CLI, so your credential helpers, SSH agent and commit signing
            work with no configuration of ours.
          </span>
        </p>
      </div>

      <div className="mt-14 sm:mt-20">
        <HeroVideo className="aspect-[16/10] w-full" />
      </div>
    </Container>
  </Section>
);
