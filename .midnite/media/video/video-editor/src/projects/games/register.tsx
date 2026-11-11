import { Composition, Folder } from "remotion";

import { FPS, GameReel, type Reel, reelFrames } from "./GameReel";
import { GTACT } from "./gtact";
import { OMNIVERSE } from "./omniverse";
import { SYNTHSURF } from "./synthsurf";

/**
 * The three game showreels under projects/games/. Each is a `Reel` (data) on the shared
 * beat-locked `GameReel`; registered by `src/Root.tsx`.
 */
const REELS: [string, Reel][] = [
  ["GamesGtactShowreel", GTACT],
  ["GamesOmniverseShowreel", OMNIVERSE],
  ["GamesSynthsurfShowreel", SYNTHSURF],
];

export const GamesShowreels: React.FC = () => (
  <Folder name="games">
    {REELS.map(([id, reel]) => (
      <Composition key={id} id={id} component={GameReel} durationInFrames={reelFrames(reel)} fps={FPS} width={1920} height={1080} defaultProps={{ reel }} />
    ))}
  </Folder>
);
