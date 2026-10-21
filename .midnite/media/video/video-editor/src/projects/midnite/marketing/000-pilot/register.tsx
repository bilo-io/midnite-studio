import { Composition, Folder } from "remotion";

import { DURATION } from "./beats";
import { Pilot } from "./Pilot";

/**
 * Compositions for `midnite/marketing/000-pilot`. Registered by `src/Root.tsx`.
 *
 * Composition ids stay globally unique across projects — they are what
 * `npx remotion render <id>` and `scripts/render.mjs` address, and neither
 * knows about `<Folder>`s. The folder is a Studio affordance only, which is
 * why it carries the project's path and the id carries the project's name.
 */
export const MidnitePilot: React.FC = () => (
  <Folder name="midnite-marketing-000-pilot">
    <Composition
      id="MidnitePilot"
      component={Pilot}
      durationInFrames={DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  </Folder>
);
