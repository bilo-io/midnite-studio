import { Composition, Folder } from "remotion";

import { FPS } from "./beats";
import { type CutId } from "./cuts";
import { durationOf, Episode } from "./Episode";

/**
 * Compositions for `youtube-tutorials/midnite-video-1-automated-workflow`.
 * Registered by `src/Root.tsx`. One pair per cut (`cuts.ts`): the bed, which
 * is the project's `composition`, and the go-live promo's Iron Aria.
 */
const CUT_IDS: Record<CutId, string> = {
  bed: "MidniteVideo1AutomatedWorkflow",
  ironAria: "MidniteVideo1AutomatedWorkflowIronAria",
};

export const YoutubeTutorialsMidniteVideo1: React.FC = () => (
  <Folder name="youtube-tutorials-midnite-video-1-automated-workflow">
    {(Object.keys(CUT_IDS) as CutId[]).flatMap((cut) =>
      [false, true].map((annotate) => (
        <Composition
          key={`${cut}-${annotate}`}
          id={`${CUT_IDS[cut]}${annotate ? "Annotated" : ""}`}
          component={Episode}
          durationInFrames={durationOf(cut)}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{ cut, annotate }}
        />
      )),
    )}
  </Folder>
);
