import { basename } from 'node:path';

/**
 * Mixamo naming for the importer (Phase 125 Theme B). Mixamo hands out `Walking.fbx` — or, with the skin
 * option, the same name — and users add `(1)` for a second download, a `Character@Walking.fbx` Unity-style
 * prefix, or `_withSkin`/`Without Skin` suffixes. The library wants a clean display name from all of them,
 * and to know a file is Mixamo's from its bones rather than from its name.
 */

/** `Walking (1)` → `Walking`; `X Bot@Sword And Shield Slash_withSkin` → `Sword And Shield Slash`. */
const SKIN_SUFFIX = /[\s_-]*[([]?\s*(?:with(?:out)?[\s_-]*skin|no[\s_-]*skin|skin(?:ned)?)\s*[)\]]?$/i;
const COPY_SUFFIX = /\s*[([]\s*\d+\s*[)\]]\s*$/;
/** Names an exporter leaves behind that say nothing about the clip. */
const GENERIC_NAMES = new Set(['mixamo.com', 'mixamo', 'take 001', 'take001', 'default', 'animation', 'anim', 'armature', 'untitled']);

function titleCaseWord(word: string): string {
  // Leave anything with a capital (T-Pose, AK47, mixamo's own Title Case) alone; only lift flat lower case.
  return word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** The display name for a clip file, falling back to the first usable of `fallbacks` (a take, a folder) for a generic stem. */
export function clipNameFromFile(fileName: string, ...fallbacks: (string | undefined)[]): string {
  let stem = basename(fileName).replace(/\.(?:fbx|glb|gltf|bvh)$/i, '').trim();
  stem = stem.slice(stem.lastIndexOf('@') + 1); // `Character@Walking`
  for (let pass = 0; pass < 3; pass += 1) {
    const before = stem;
    const skin = SKIN_SUFFIX.exec(stem);
    if (skin) stem = stem.slice(0, skin.index);
    stem = stem.replace(COPY_SUFFIX, '');
    stem = stem.replace(/[\s_.-]+$/g, '');
    if (stem === before) break;
  }
  stem = stem
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (stem === '' || GENERIC_NAMES.has(stem.toLowerCase())) {
    const alts = fallbacks.map((f) => (f ?? '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim());
    stem = alts.find((alt) => alt !== '' && !GENERIC_NAMES.has(alt.toLowerCase())) ?? 'Animation';
  }
  return stem.split(' ').map(titleCaseWord).join(' ').slice(0, 120);
}

/**
 * Whether a skeleton is Mixamo's: `mixamorig:Hips` (FBX), `mixamorig_Hips` or `mixamorigHips` (a glTF re-export).
 * A single stray bone is not enough — five carry the prefix, or the hips do.
 */
export function detectMixamo(boneNames: readonly string[]): boolean {
  const prefixed = boneNames.filter((name) => /^mixamorig/i.test(name));
  return prefixed.length >= 5 || prefixed.some((name) => /^mixamorig[:_]?hips$/i.test(name));
}
