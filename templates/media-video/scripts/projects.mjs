/**
 * Finding the repo's projects.
 *
 * A project **id is a path**, not a single segment: this repo files videos as
 * `<brand>/<category>/<NNN-name>` (e.g. `acme/marketing/000-example`), so a
 * project is "any directory under projects/ that contains a project.json" and
 * its id is that directory's path relative to projects/.
 *
 * Its own module rather than a named export from `sync-assets.mjs`, because
 * `render.mjs` needs it too and importing a script that syncs on load would
 * mirror every asset just to read a directory listing.
 */
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** `.hidden` and `_template`/`_stills` are never projects. */
export const SKIP_DIR = /^(\.|_)/;

/**
 * Every project id under `projectsDir`, at whatever depth, in listing order.
 *
 * Recursion stops at a project.json: a project's own subfolders (`input/`,
 * `notes/`, `output/`) are its contents, not more projects.
 */
export const findProjects = (projectsDir) => {
  const scan = (dir) =>
    readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !SKIP_DIR.test(e.name))
      .flatMap((e) => {
        const p = join(dir, e.name);
        return existsSync(join(p, "project.json")) ? [relative(projectsDir, p)] : scan(p);
      });
  return existsSync(projectsDir) ? scan(projectsDir) : [];
};
