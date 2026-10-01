import { Composition, Folder } from "remotion";

import { DURATION } from "./beats";
import { Promo } from "./Promo";

/**
 * Compositions for `midnite/marketing/001-golive-promo`. Registered by `src/Root.tsx`.
 *
 * Composition ids stay globally unique across projects — they are what
 * `npx remotion render <id>` and `scripts/render.mjs` address, and neither
 * knows about `<Folder>`s. The folder is a Studio affordance only, which is why
 * it carries the project's path and the id carries the project's name.
 */
export const MidniteGolivePromo: React.FC = () => (
  <Folder name="midnite-marketing-001-golive-promo">
    <Composition
      id="MidniteGolivePromo"
      component={Promo}
      durationInFrames={DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  </Folder>
);
