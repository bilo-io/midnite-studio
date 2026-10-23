import { Eyebrow, Heading, Reveal, Section } from '../../components';
import { PilotVideo } from '../hero/pilot-video';

/**
 * The showreel, straight under the hero: the Midnite Apps music video, a
 * three-minute tour of every app in the suite, rendered with Remotion from
 * `.midnite/media/video/projects/midnite-apps`.
 *
 * It reuses `PilotVideo` with its own clip, so it keeps the same contract: a
 * soundtrack means click-to-play, and `preload="none"` means a visitor who
 * scrolls past downloads nothing. How the clip was encoded is in
 * `public/video/README.md`.
 */
export const Showreel = () => (
  <Section id="showreel" label="Showreel">
    <Reveal>
      <div className="flex flex-col items-center gap-4 text-center">
        <Eyebrow>Showreel</Eyebrow>
        <Heading level={2} typeIn>
          Every app, in three minutes
        </Heading>
      </div>
    </Reveal>

    <Reveal delay={120} className="mx-auto mt-10 max-w-5xl sm:mt-14">
      <PilotVideo
        src="video/midnite-apps.mp4"
        poster="video/midnite-apps-poster.jpg"
        label="Midnite Apps showreel: a tour of every app in the suite, with music."
        playLabel="Play the Midnite Apps showreel"
        testId="showreel-video"
      />
    </Reveal>
  </Section>
);
