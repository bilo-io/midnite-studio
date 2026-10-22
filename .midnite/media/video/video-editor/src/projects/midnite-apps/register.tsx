import { Composition, Folder } from "remotion";

import { FPS } from "./cuts";
import { durationOf, Episode } from "./Episode";

/**
 * Compositions for `midnite-apps`. Registered by `src/Root.tsx`: the film, which
 * is the project's `composition`, and its `…Annotated` twin (slot, beat and
 * stage over the picture).
 */
export const MidniteApps: React.FC = () => (
  <Folder name="midnite-apps">
    {[false, true].map((annotate) => (
      <Composition
        key={String(annotate)}
        id={`MidniteApps${annotate ? "Annotated" : ""}`}
        component={Episode}
        durationInFrames={durationOf("bed")}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ cut: "bed" as const, annotate }}
      />
    ))}
  </Folder>
);
