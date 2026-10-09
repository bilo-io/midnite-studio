import "./index.css";

import { ExampleHello } from "./projects/example/000-hello/register";
import { MidnitePilot } from "./projects/midnite/marketing/000-pilot/register";
import { MidniteGolivePromo } from "./projects/midnite/marketing/001-golive-promo/register";
import { TemplateMidniteGolivePromo } from "./templates/midnite/golive-promo/register";

/**
 * One editor app, many videos: each project under `src/projects/<project-id>/`
 * — mirroring its path in the repo's `projects/` — exports a `register.tsx`
 * that puts its compositions in a <Folder>. Add a video by adding a folder and
 * one line here.
 *
 * Templates under `src/templates/<id>/` — mirroring the repo's `templates/` —
 * register the same way.
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <ExampleHello />
      <MidnitePilot />
      <MidniteGolivePromo />
      <TemplateMidniteGolivePromo />
    </>
  );
};
