import { Composition, Folder } from "remotion";

import { FPS } from "./beats";
import { DURATION, Template } from "./Template";

/**
 * Compositions for the `templates/youtube-tutorials/neon-hud` template.
 * Registered by `src/Root.tsx`; ids are prefixed `Template` so they cannot
 * collide with an episode's.
 */
export const TemplateYoutubeTutorialsNeonHud: React.FC = () => (
  <Folder name="templates-youtube-tutorials-neon-hud">
    <Composition
      id="TemplateNeonHud"
      component={Template}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ annotate: false }}
    />
    <Composition
      id="TemplateNeonHudAnnotated"
      component={Template}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ annotate: true }}
    />
  </Folder>
);
