import { Composition, Folder } from "remotion";

import { FPS } from "./beats";
import { DURATION, Template } from "./Template";

/**
 * Compositions for the `templates/explainers/ink-morph` template.
 * Registered by `src/Root.tsx`; ids are prefixed `Template` so they cannot
 * collide with a project's.
 */
export const TemplateExplainersInkMorph: React.FC = () => (
  <Folder name="templates-explainers-ink-morph">
    <Composition
      id="TemplateInkMorph"
      component={Template}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ annotate: false }}
    />
    <Composition
      id="TemplateInkMorphAnnotated"
      component={Template}
      durationInFrames={DURATION}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ annotate: true }}
    />
  </Folder>
);
