import { Composition, Folder } from "remotion";

import { FPS, T } from "./beats";
import { Template } from "./Template";

/**
 * Compositions for the `templates/midnite/golive-promo` template. Registered by
 * `src/Root.tsx`. Ids are prefixed `Template` so they cannot collide with a
 * project's — `remotion render` addresses compositions by id alone.
 */
export const TemplateMidniteGolivePromo: React.FC = () => (
  <Folder name="templates-midnite-golive-promo">
    <Composition
      id="TemplateGolivePromo"
      component={Template}
      durationInFrames={T.duration}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ annotate: false }}
    />
    <Composition
      id="TemplateGolivePromoAnnotated"
      component={Template}
      durationInFrames={T.duration}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ annotate: true }}
    />
  </Folder>
);
