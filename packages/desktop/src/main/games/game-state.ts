import { GAME_STATE_MAX_BYTES, GAME_STATE_MAX_DEPTH, GameStateSchema, jsonDepth, type GameState } from '@midnite/studio-shared';

import { McpToolError } from '../mcp/errors';

/**
 * Reading a game's `window.__midnite.getState()` (Theme D, shared with Theme O's
 * play-tests). The page's answer is untrusted data: a string capped, parsed as
 * JSON, depth-bounded and validated — never code that is evaluated.
 */

/** A hostile `getState` has this long before the call gives up. */
export const GAME_STATE_TIMEOUT_MS = 2000;
const ERROR_TEXT_MAX = 300;

export const clipError = (text: string): string => (text.length <= ERROR_TEXT_MAX ? text : `${text.slice(0, ERROR_TEXT_MAX - 1)}…`);

export const GET_STATE_JS =
  '(() => { try { return JSON.stringify(window.__midnite?.getState?.() ?? null) } catch (e) { return JSON.stringify({ __error: String(e) }) } })()';

/** Evaluate `code` in the page with a timeout; a timeout or a page error is an `McpToolError`. */
export async function evalWithTimeout(
  evaluate: (code: string) => Promise<unknown>,
  code: string,
  timeoutMs: number,
  what: string,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new McpToolError('error', `${what} did not answer within ${Math.round(timeoutMs / 1000)} s.`)), timeoutMs);
  });
  try {
    return await Promise.race([evaluate(code), timeout]);
  } catch (error) {
    if (error instanceof McpToolError) throw error;
    throw new McpToolError('error', clipError(`${what} failed: ${error instanceof Error ? error.message : String(error)}`));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function readGameState(evaluate: (code: string) => Promise<unknown>): Promise<GameState> {
  const raw = await evalWithTimeout(evaluate, GET_STATE_JS, GAME_STATE_TIMEOUT_MS, 'getState()');
  if (typeof raw !== 'string') throw new McpToolError('error', 'getState() did not return JSON.');
  if (raw.length > GAME_STATE_MAX_BYTES) throw new McpToolError('error', 'getState() returned more than 256 KB.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new McpToolError('error', 'getState() did not return valid JSON.');
  }
  if (parsed === null) throw new McpToolError('error', 'This game has no state hook (window.__midnite.getState).');
  if (jsonDepth(parsed) > GAME_STATE_MAX_DEPTH) {
    throw new McpToolError('error', `getState() is nested deeper than ${GAME_STATE_MAX_DEPTH} levels.`);
  }
  const error = (parsed as { __error?: unknown }).__error;
  if (typeof error === 'string') throw new McpToolError('error', clipError(`getState() threw: ${error}`));
  const valid = GameStateSchema.safeParse(parsed);
  if (!valid.success) {
    const issue = valid.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.join('.') : '';
    throw new McpToolError(
      'error',
      where ? clipError(`getState() returned a bad ${where}: ${issue?.message ?? 'invalid'}.`) : 'getState() must return an object.',
    );
  }
  return valid.data;
}
