import { Composition, Folder } from "remotion";

import { Hello, HELLO_DURATION } from "./Hello";

/**
 * Compositions for `example/000-hello`. Registered by `src/Root.tsx`.
 *
 * Composition ids stay globally unique across projects — they are what
 * `npx remotion render <id>` and `scripts/render.mjs` address, and neither
 * knows about `<Folder>`s.
 */
export const ExampleHello: React.FC = () => (
  <Folder name="example-000-hello">
    <Composition
      id="ExampleHello"
      component={Hello}
      durationInFrames={HELLO_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  </Folder>
);
