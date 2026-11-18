import { failure, GAME_NAV_VERTICES_MAX, GameDebugOptionsSchema, GameNavMeshSchema, ok, type GameDebugOptions, type GameNavMesh, type GitOpResult } from '@midnite/studio-shared';

import { clipError, evalWithTimeout } from './game-state';

/**
 * In-game debug draw and the nav-mesh read (Phase 140 Theme G): `window.__midnite.debug(...)` switches the running
 * game's overlays, `window.__midnite.navMesh()` hands the editor the mesh the AI walks. The page's answer is
 * untrusted: capped, parsed as JSON and validated, never evaluated.
 */

export const GAME_DEBUG_TIMEOUT_MS = 1000;
/** A nav-mesh answer larger than this many characters is refused before it is parsed. */
export const GAME_NAV_MAX_BYTES = 2 * 1024 * 1024;

const KIT_TOO_OLD = "This game's kit predates debug draw (0.14). Upgrade the kit to use it.";

/** The switches as a JS literal: only booleans reach the page, so the splice is safe. */
function patchLiteral(patch: Partial<GameDebugOptions>): string {
  const clean: Partial<GameDebugOptions> = {};
  for (const key of ['colliders', 'triggers', 'nav'] as const) if (typeof patch[key] === 'boolean') clean[key] = patch[key];
  return JSON.stringify(clean);
}

/** The exec string for `debug(patch)`; `null` when the game has no hook or an older kit. Exported for the runner test. */
export const debugCode = (patch: Partial<GameDebugOptions>): string =>
  `(() => { try { const h = window.__midnite; if (!h || typeof h.debug !== "function") return null; return JSON.stringify(h.debug(${patchLiteral(patch)})); } catch (e) { return JSON.stringify({ __error: String(e) }); } })()`;

/** Switch a game's debug overlays; answers the options now in force. */
export async function setGameDebug(evaluate: (code: string) => Promise<unknown>, patch: Partial<GameDebugOptions>): Promise<GitOpResult<GameDebugOptions>> {
  let raw: unknown;
  try {
    raw = await evalWithTimeout(evaluate, debugCode(patch), GAME_DEBUG_TIMEOUT_MS, 'debug()');
  } catch (error) {
    return failure(error instanceof Error ? clipError(error.message) : 'Could not reach the game.');
  }
  if (raw === null) return failure(KIT_TOO_OLD);
  if (typeof raw !== 'string') return failure('debug() did not return JSON.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return failure('debug() did not return valid JSON.');
  }
  const error = (parsed as { __error?: unknown } | null)?.__error;
  if (typeof error === 'string') return failure(clipError(`debug() threw: ${error}`));
  const valid = GameDebugOptionsSchema.safeParse(parsed);
  return valid.success ? ok(valid.data) : failure('debug() answered with options Midnite Studio does not understand.');
}

export const NAV_MESH_JS =
  '(() => { try { const h = window.__midnite; if (!h || typeof h.navMesh !== "function") return null; return JSON.stringify(h.navMesh()); } catch (e) { return JSON.stringify({ __error: String(e) }); } })()';

/**
 * Read a game's nav-mesh. A game without one (or on an older kit) answers no polygons; a mesh over
 * {@link GAME_NAV_VERTICES_MAX} vertices is refused with a message rather than sent.
 */
export async function readGameNavMesh(evaluate: (code: string) => Promise<unknown>): Promise<GitOpResult<GameNavMesh>> {
  let raw: unknown;
  try {
    raw = await evalWithTimeout(evaluate, NAV_MESH_JS, GAME_DEBUG_TIMEOUT_MS * 3, 'navMesh()');
  } catch (error) {
    return failure(error instanceof Error ? clipError(error.message) : 'Could not reach the game.');
  }
  if (raw === null) return ok({ polygons: [] });
  if (typeof raw !== 'string') return failure('navMesh() did not return JSON.');
  if (raw.length > GAME_NAV_MAX_BYTES) return failure(`The nav-mesh is too large to show (over ${GAME_NAV_MAX_BYTES / 1024 / 1024} MB).`);
  let parsed: { __error?: unknown; polygons?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return failure('navMesh() did not return valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) return failure('navMesh() must return { polygons }.');
  if (typeof parsed.__error === 'string') return failure(clipError(`navMesh() threw: ${parsed.__error}`));
  if (!Array.isArray(parsed.polygons)) return failure('navMesh() must return { polygons }.');
  const vertices = parsed.polygons.reduce<number>((n, p) => n + (Array.isArray(p) ? p.length : 0), 0);
  if (vertices > GAME_NAV_VERTICES_MAX) return failure(`The nav-mesh has ${vertices.toLocaleString('en-US')} vertices; the editor shows at most ${GAME_NAV_VERTICES_MAX.toLocaleString('en-US')}.`);
  const valid = GameNavMeshSchema.safeParse(parsed);
  return valid.success ? ok(valid.data) : failure('navMesh() answered with a mesh Midnite Studio does not understand.');
}
