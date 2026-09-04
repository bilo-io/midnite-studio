/**
 * A project's id IS its folder name (Theme B's own invariant) — a human
 * reads it in Finder, in the terminal, in a render's output path. Unlike a
 * workflow or council id (an opaque uuid nobody looks at), a title-derived
 * slug is the whole point: `ekko-videos/projects/01-cop31-showreel` reads as
 * a name, not a hash.
 */
export function slugifyProjectTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
