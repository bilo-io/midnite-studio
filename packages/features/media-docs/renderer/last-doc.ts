/** A doc candidate for the initial Docs selection. */
export type DocCandidate = { project: string; path: string; mtimeMs: number };
export type DocPick = { project: string; path: string };

/**
 * Which doc Docs opens on entry: the last *edited* one if it still exists,
 * else the most recently modified doc, else the first doc (project then path
 * order). `null` when there are no docs at all.
 */
export function pickInitialDoc(docs: readonly DocCandidate[], remembered: DocPick | null | undefined): DocPick | null {
  if (docs.length === 0) return null;
  if (remembered) {
    const hit = docs.find((d) => d.project === remembered.project && d.path === remembered.path);
    if (hit) return { project: hit.project, path: hit.path };
  }
  let newest: DocCandidate | null = null;
  for (const d of docs) if (d.mtimeMs > 0 && (newest === null || d.mtimeMs > newest.mtimeMs)) newest = d;
  const chosen = newest ?? docs[0]!;
  return { project: chosen.project, path: chosen.path };
}
