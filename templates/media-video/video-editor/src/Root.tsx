import "./index.css";

import { ExampleHello } from "./projects/example/000-hello/register";

/**
 * One editor app, many videos: each project under `src/projects/<project-id>/`
 * — mirroring its path in the workspace's `projects/` — exports a
 * `register.tsx` that puts its compositions in a <Folder>. Add a video by
 * adding a folder and one line here.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <ExampleHello />
    </>
  );
};
