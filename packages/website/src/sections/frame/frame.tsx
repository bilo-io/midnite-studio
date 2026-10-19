import type { CSSProperties } from 'react';
import type { IconType } from 'react-icons';
import {
  LuFolderTree,
  LuGitBranch,
  LuGlobe,
  LuMessageCircle,
  LuNetwork,
  LuPanelsTopLeft,
  LuRepeat,
  LuTerminal,
} from 'react-icons/lu';

import { FRAME_PARTS } from '../../apps/catalog';
import { Eyebrow, Heading, Lede, Reveal, Section, useInView } from '../../components';

/** A glyph per frame part, keyed by its label in `FRAME_PARTS`. */
const ICONS: Record<string, IconType> = {
  Layout: LuPanelsTopLeft,
  Terminal: LuTerminal,
  Companion: LuMessageCircle,
  Loops: LuRepeat,
  Browser: LuGlobe,
  Explorer: LuFolderTree,
  'Git Graph': LuGitBranch,
  Knowledge: LuNetwork,
};

/**
 * The frame: what every app comes with, because every app is built on it.
 * The parts are the launcher's own list (`FRAME_PARTS`), in its order.
 */
export const Frame = () => {
  const { ref, inView } = useInView<HTMLUListElement>();

  return (
    <Section id="frame" label="The frame">
      <Reveal>
        <div className="flex flex-col items-start gap-4">
          <Eyebrow>In every app</Eyebrow>
          <Heading level={2} typeIn>
            Built on one frame
          </Heading>
          <Lede typeIn>
            The things you reach for all day are not features of one app. They are the frame every
            app is built on, so they are there whichever app you open, and they work the same way
            in each.
          </Lede>
        </div>
      </Reveal>

      <ul
        ref={ref}
        className={`mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${inView ? 'ws-cascade-in' : ''}`}
      >
        {FRAME_PARTS.map((part, index) => {
          const Icon = ICONS[part.label] ?? LuPanelsTopLeft;
          return (
            <li
              key={part.label}
              className="ws-cascade flex flex-col gap-3 rounded-2xl border border-line bg-bg-elevated p-5"
              style={{ '--i': index } as CSSProperties}
            >
              <Icon aria-hidden="true" className="h-5 w-5 text-accent" />
              <h3 className="font-semibold text-fg">{part.label}</h3>
              <p className="text-sm leading-relaxed text-fg-muted">{part.blurb}</p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
};
