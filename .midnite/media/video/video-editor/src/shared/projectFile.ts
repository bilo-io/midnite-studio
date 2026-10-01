import { staticFile } from "remotion";

/**
 * Resolver for a project's own input files.
 *
 * A project id is a path (`acme/marketing/000-example`), not a single
 * segment — see `scripts/projects.mjs`. It nests straight through, so this
 * needs no special case for depth.
 *
 * `scripts/sync-assets.mjs` mirrors the repo's shared library into
 * `public/` at its own paths (`logos/…`, `video/…`, `audio/…`) and each
 * project's `input/` into `public/projects/<project-id>/`, so shared assets are
 * `staticFile("logos/acme/mark-white.svg")` and project-specific ones are
 * `projectFile("<project-id>")("original.mp4")`.
 *
 * Each project defines its bound copy once, in its own `assets.ts`.
 */
export const projectFile =
  (projectId: string) =>
  (path: string): string =>
    staticFile(`projects/${projectId}/${path}`);
