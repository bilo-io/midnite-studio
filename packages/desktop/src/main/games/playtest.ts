import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  diffFrames,
  evaluateStateAssertion,
  FRAME_DIFF_TOLERANCE,
  GAME_BASELINES_DIR,
  GAME_PLAYTESTS_DIR,
  GAME_REPLAY_MAX_BYTES,
  GAME_REPLAYS_DIR,
  GAME_RESULTS_DIR,
  GamePlaytestResultSchema,
  GamePlaytestSchema,
  GameReplaySchema,
  rgbaFromRaster,
  type GameAssertResult,
  type GamePlaytest,
  type GamePlaytestAssert,
  type GamePlaytestEntry,
  type GamePlaytestResult,
  type GameReplay,
  type GameState,
  type GameSummary,
  type JsonPathOp,
  type RgbaImage,
} from '@midnite/studio-shared';

import { McpToolError } from '../mcp/errors';
import { decodePng, encodePngRgba8 } from '../media/png/png-codec';
import { confineToRoot, joinWithin } from '../fs-scope';
import { clipError, evalWithTimeout, readGameState } from './game-state';

/**
 * Play-test depth (Phase 107 Theme O): deterministic runs, frame-indexed input
 * replays, JSON-path and frame-diff assertions, and `playtests/*.json`.
 *
 * Everything goes through the kit's `window.__midnite.replay` — never OS input —
 * so playback is frame-exact: the game restarts in deterministic mode, paused
 * after its first step; the replay is loaded; and the page is stepped to each
 * assertion's frame, where its state is read or its picture captured. The one
 * implementation behind the `game_replay_*`, `game_assert_*` and `game_playtest`
 * MCP tools and the runner toolbar's Playtests menu.
 *
 * What the page answers is untrusted: every reply is a capped string, parsed as
 * JSON and validated, and replays reach the page only after zod validated them
 * (embedded as a JSON literal, never as code from a file).
 */

/** The slice of a running game's page play-tests need — a fake in tests. */
export type PlaytestPage = {
  evaluate(code: string): Promise<unknown>;
  /** The current frame as PNG bytes. */
  capture(): Promise<Buffer>;
};

export type PlaytestDeps = {
  resolve: (target: string) => Promise<GameSummary | null>;
  /** Restart the game, deterministic with this seed and paused after its first step. */
  runDeterministic: (gameId: string, seed: number) => Promise<{ ok: true } | { ok: false; message?: string }>;
  /** Tell the toolbar the game is paused or running again. */
  setRunState?: (gameId: string, state: 'pause' | 'resume') => Promise<unknown>;
  page: (gameId: string) => PlaytestPage | null;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** How long a restarted game has to print `midnite-ready`. */
  readyTimeoutMs?: number;
};

export const PLAYTEST_READY_TIMEOUT_MS = 20_000;
/** Steps per `seek` call at full speed: each is one synchronous page evaluation. */
export const PLAYTEST_SEEK_CHUNK = 600;
const SEEK_TIMEOUT_MS = 30_000;

const NOT_RUNNING = 'Run the game first.';
const OLD_KIT =
  'This game’s kit has no replay hook (window.__midnite.replay) — Upgrade kit, or install the hook, to use play-tests.';

const READY_JS =
  '(() => { const m = window.__midnite; if (!m) return "none"; if (!m.replay || typeof m.replay.seek !== "function") return "old"; return m.ready === true ? "ready" : "wait"; })()';

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Decode PNG bytes to RGBA, or `null` when they are not a PNG this codec reads. */
function decodeRgba(bytes: Uint8Array): RgbaImage | null {
  const decoded = decodePng(bytes);
  return decoded.ok ? rgbaFromRaster(decoded.image) : null;
}

const baselineFile = (name: string, frame: number): string => `${GAME_BASELINES_DIR}/${name}@${frame}.png`;

/** Parse a page answer that should be a capped JSON string. */
function parsePageJson(raw: unknown, what: string): unknown {
  if (typeof raw !== 'string') throw new McpToolError('error', `${what} did not return JSON.`);
  if (raw.length > GAME_REPLAY_MAX_BYTES) throw new McpToolError('error', `${what} returned more than 2 MB.`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new McpToolError('error', `${what} did not return valid JSON.`);
  }
}

async function writeRepoFile(root: string, rel: string, data: string | Buffer): Promise<void> {
  const target = joinWithin(root, rel);
  if (!target) throw new McpToolError('refused', `${rel} is outside the game.`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
}

/** Read a repo-relative JSON file, confined to the repo (symlinks included) and capped. */
async function readRepoJson(root: string, rel: string): Promise<unknown> {
  const real = await confineToRoot(root, rel);
  if (!real) throw new McpToolError('not-found', `${rel} was not found in the game.`);
  const text = await readFile(real, 'utf8');
  if (text.length > GAME_REPLAY_MAX_BYTES) throw new McpToolError('error', `${rel} is larger than 2 MB.`);
  try {
    return JSON.parse(text);
  } catch {
    throw new McpToolError('error', `${rel} is not valid JSON.`);
  }
}

const firstIssue = (error: { issues: { path: (string | number)[]; message: string }[] }): string => {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || '(root)'}: ${issue.message}` : 'invalid';
};

export function createPlaytests(deps: PlaytestDeps) {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? (() => Date.now());

  async function need(target: string): Promise<GameSummary> {
    const game = await deps.resolve(target);
    if (!game) throw new McpToolError('not-found', 'That game was not found — `game_list` returns the ids.');
    return game;
  }

  function running(gameId: string): PlaytestPage {
    const page = deps.page(gameId);
    if (!page) throw new McpToolError('error', NOT_RUNNING);
    return page;
  }

  /** Restart deterministically and wait for the kit's hook to report ready (paused after step 1). */
  async function restart(gameId: string, seed: number): Promise<PlaytestPage> {
    const started = await deps.runDeterministic(gameId, seed);
    if (!started.ok) throw new McpToolError('error', started.message ?? 'The game did not start.');
    const deadline = now() + (deps.readyTimeoutMs ?? PLAYTEST_READY_TIMEOUT_MS);
    let last = 'wait';
    while (now() < deadline) {
      const page = deps.page(gameId);
      if (!page) throw new McpToolError('error', 'The game stopped before it was ready.');
      try {
        const answer = await evalWithTimeout((code) => page.evaluate(code), READY_JS, 2000, 'The game');
        last = typeof answer === 'string' ? answer : 'wait';
      } catch {
        last = 'wait'; // Navigating: the old document is gone and the new one is not up yet.
      }
      if (last === 'ready') return page;
      if (last === 'old') throw new McpToolError('error', OLD_KIT);
      await sleep(100);
    }
    throw new McpToolError(
      'error',
      last === 'none' ? 'The game never installed window.__midnite (is it a kit game?).' : 'The game did not print midnite-ready in time.',
    );
  }

  async function seek(page: PlaytestPage, frame: number): Promise<number> {
    // In chunks, so no single synchronous evaluation runs for long.
    for (;;) {
      const status = parsePageJson(
        await evalWithTimeout((code) => page.evaluate(code), 'JSON.stringify(window.__midnite.replay.status())', 2000, 'replay.status()'),
        'replay.status()',
      ) as { frame?: unknown };
      const at = typeof status.frame === 'number' ? status.frame : 0;
      const next = Math.min(frame, at + PLAYTEST_SEEK_CHUNK);
      const answer = parsePageJson(
        await evalWithTimeout(
          (code) => page.evaluate(code),
          `JSON.stringify(window.__midnite.replay.seek(${Math.trunc(next)}))`,
          SEEK_TIMEOUT_MS,
          'replay.seek()',
        ),
        'replay.seek()',
      ) as { ok?: unknown; frame?: unknown; message?: unknown };
      if (answer.ok !== true) {
        throw new McpToolError('error', clipError(typeof answer.message === 'string' ? answer.message : `Could not step to frame ${frame}.`));
      }
      const reached = typeof answer.frame === 'number' ? answer.frame : next;
      if (reached >= frame) return reached;
    }
  }

  async function loadReplay(page: PlaytestPage, replay: GameReplay): Promise<void> {
    // `replay` passed zod: a JSON literal of plain data, embedded as an expression.
    const loaded = await evalWithTimeout(
      (code) => page.evaluate(code),
      `window.__midnite.replay.load(${JSON.stringify(replay)}) === true`,
      5000,
      'replay.load()',
    );
    if (loaded !== true) throw new McpToolError('error', 'The game refused the replay.');
  }

  async function resolveReplay(root: string, ref: string | GameReplay): Promise<GameReplay> {
    const value = typeof ref === 'string' ? await readRepoJson(root, ref) : ref;
    const parsed = GameReplaySchema.safeParse(value);
    if (!parsed.success) {
      throw new McpToolError('error', clipError(`${typeof ref === 'string' ? ref : 'The replay'} is not a valid replay (${firstIssue(parsed.error)}).`));
    }
    return parsed.data;
  }

  async function capture(page: PlaytestPage): Promise<Buffer> {
    try {
      return await page.capture();
    } catch (error) {
      throw new McpToolError('error', clipError(`Could not capture the game: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  type FrameCheck = {
    status: 'pass' | 'fail' | 'baseline-created';
    message: string;
    changedFraction?: number;
    png: Buffer;
    diffPng?: Buffer;
  };

  /** Compare the current frame with a baseline, writing the baseline when it is missing. */
  async function checkFrame(root: string, page: PlaytestPage, name: string, frame: number, tolerance: number): Promise<FrameCheck> {
    const png = await capture(page);
    const rel = baselineFile(name, frame);
    const existing = await confineToRoot(root, rel);
    if (!existing) {
      await writeRepoFile(root, rel, png);
      return { status: 'baseline-created', message: `Wrote the baseline ${rel}.`, png };
    }
    const actual = decodeRgba(png);
    const baseline = decodeRgba(await readFile(existing));
    if (!actual) throw new McpToolError('error', 'The captured frame could not be decoded.');
    if (!baseline) throw new McpToolError('error', `${rel} is not a PNG this app can read.`);
    const { changedFraction, diff } = diffFrames(baseline, actual);
    const pct = (changedFraction * 100).toFixed(2);
    if (changedFraction <= tolerance) {
      return { status: 'pass', message: `${pct}% of pixels changed (tolerance ${(tolerance * 100).toFixed(2)}%).`, changedFraction, png };
    }
    const sizeNote =
      baseline.width !== actual.width || baseline.height !== actual.height
        ? ` The frame is ${actual.width}×${actual.height}; the baseline is ${baseline.width}×${baseline.height}.`
        : '';
    return {
      status: 'fail',
      message: `${pct}% of pixels changed, over the ${(tolerance * 100).toFixed(2)}% tolerance.${sizeNote}`,
      changedFraction,
      png,
      diffPng: encodePngRgba8(new Uint8Array(diff.data.buffer, diff.data.byteOffset, diff.data.byteLength), diff.width, diff.height),
    };
  }

  /** Run one play-test against a fresh deterministic restart. Never throws: problems come back as `error`. */
  async function runOne(game: GameSummary, playtest: GamePlaytest): Promise<{ result: GamePlaytestResult; failures: Buffer[] }> {
    const started = now();
    const results: GameAssertResult[] = [];
    const failures: Buffer[] = [];
    let frames = 0;
    let error: string | undefined;
    try {
      const replay = await resolveReplay(game.path, playtest.replay);
      const page = await restart(game.gameId, replay.seed);
      await loadReplay(page, replay);
      const ordered = playtest.asserts.map((assert, index) => ({ assert, index })).sort((a, b) => a.assert.frame - b.assert.frame || a.index - b.index);
      for (const { assert, index } of ordered) {
        results.push(await runAssert(game, page, playtest.name, assert, index, failures));
        frames = Math.max(frames, assert.frame);
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    if (deps.page(game.gameId)) await deps.setRunState?.(game.gameId, 'pause').catch(() => undefined);
    results.sort((a, b) => a.assertIndex - b.assertIndex);
    const result: GamePlaytestResult = {
      name: playtest.name,
      passed: error === undefined && results.every((r) => r.ok),
      ranAt: new Date(started).toISOString(),
      frames,
      ms: Math.max(0, now() - started),
      results,
      ...(error === undefined ? {} : { error: clipError(error) }),
    };
    await writeRepoFile(game.path, `${GAME_RESULTS_DIR}/${playtest.name}.json`, `${JSON.stringify(result, null, 2)}\n`).catch(() => undefined);
    return { result, failures };
  }

  async function runAssert(
    game: GameSummary,
    page: PlaytestPage,
    name: string,
    assert: GamePlaytestAssert,
    index: number,
    failures: Buffer[],
  ): Promise<GameAssertResult> {
    const base = { assertIndex: index, frame: assert.frame, kind: assert.kind };
    try {
      await seek(page, assert.frame);
      if (assert.kind === 'state') {
        const state = await readGameState((code) => page.evaluate(code));
        const verdict = evaluateStateAssertion(state, stateAssertion(assert));
        if (verdict.ok) return { ...base, ok: true, status: 'pass', message: verdict.message };
        const png = await capture(page);
        const shot = `${GAME_RESULTS_DIR}/${name}-${index}.png`;
        await writeRepoFile(game.path, shot, png);
        failures.push(png);
        return { ...base, ok: false, status: 'fail', message: verdict.message, screenshot: shot };
      }
      const check = await checkFrame(game.path, page, assert.baseline ?? name, assert.frame, assert.tolerance ?? FRAME_DIFF_TOLERANCE);
      if (check.status !== 'fail') {
        return { ...base, ok: true, status: check.status, message: check.message, ...(check.changedFraction === undefined ? {} : { changedFraction: check.changedFraction }) };
      }
      const shot = `${GAME_RESULTS_DIR}/${name}-${index}.png`;
      const diff = `${GAME_RESULTS_DIR}/${name}-${index}-diff.png`;
      await writeRepoFile(game.path, shot, check.png);
      if (check.diffPng) await writeRepoFile(game.path, diff, check.diffPng);
      failures.push(check.png);
      if (check.diffPng) failures.push(check.diffPng);
      return {
        ...base,
        ok: false,
        status: 'fail',
        message: check.message,
        screenshot: shot,
        ...(check.diffPng ? { diff } : {}),
        ...(check.changedFraction === undefined ? {} : { changedFraction: check.changedFraction }),
      };
    } catch (caught) {
      return { ...base, ok: false, status: 'error', message: clipError(caught instanceof Error ? caught.message : String(caught)) };
    }
  }

  async function readPlaytest(root: string, file: string): Promise<{ ok: true; playtest: GamePlaytest } | { ok: false; issue: string }> {
    let value: unknown;
    try {
      value = await readRepoJson(root, `${GAME_PLAYTESTS_DIR}/${file}`);
    } catch (caught) {
      return { ok: false, issue: caught instanceof Error ? caught.message : String(caught) };
    }
    const parsed = GamePlaytestSchema.safeParse(value);
    if (!parsed.success) return { ok: false, issue: clipError(firstIssue(parsed.error)) };
    if (`${parsed.data.name}.json` !== file) return { ok: false, issue: `Its name is "${parsed.data.name}", but the file is ${file}.` };
    return { ok: true, playtest: parsed.data };
  }

  async function lastResult(root: string, name: string): Promise<GamePlaytestResult | null> {
    try {
      const parsed = GamePlaytestResultSchema.safeParse(await readRepoJson(root, `${GAME_RESULTS_DIR}/${name}.json`));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async function list(gameId: string): Promise<GamePlaytestEntry[]> {
    const game = await need(gameId);
    let files: string[];
    try {
      const real = await confineToRoot(game.path, GAME_PLAYTESTS_DIR);
      files = real ? (await readdir(real, { withFileTypes: true })).filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name) : [];
    } catch {
      files = [];
    }
    files.sort();
    const entries: GamePlaytestEntry[] = [];
    for (const file of files) {
      const name = file.slice(0, -'.json'.length);
      const read = await readPlaytest(game.path, file);
      entries.push({
        name,
        file: `${GAME_PLAYTESTS_DIR}/${file}`,
        valid: read.ok,
        issue: read.ok ? null : read.issue,
        last: await lastResult(game.path, name),
      });
    }
    return entries;
  }

  /** Run named play-tests (or every valid one), one after another. */
  async function run(target: string, opts: { names?: readonly string[]; inline?: GamePlaytest } = {}) {
    const game = await need(target);
    const runs: GamePlaytestResult[] = [];
    const failures: Buffer[] = [];
    const playtests: GamePlaytest[] = [];
    if (opts.inline) playtests.push(opts.inline);
    else {
      const entries = await list(game.gameId);
      const wanted = opts.names && opts.names.length > 0 ? new Set(opts.names) : null;
      for (const name of wanted ?? []) {
        if (!entries.some((e) => e.name === name)) throw new McpToolError('not-found', `There is no ${GAME_PLAYTESTS_DIR}/${name}.json.`);
      }
      for (const entry of entries) {
        if (wanted && !wanted.has(entry.name)) continue;
        const read = await readPlaytest(game.path, `${entry.name}.json`);
        if (read.ok) playtests.push(read.playtest);
        else if (wanted) throw new McpToolError('error', clipError(`${entry.file}: ${read.issue}`));
      }
      if (playtests.length === 0) throw new McpToolError('not-found', `This game has no play-tests in ${GAME_PLAYTESTS_DIR}/.`);
    }
    for (const playtest of playtests) {
      const one = await runOne(game, playtest);
      runs.push(one.result);
      failures.push(...one.failures);
    }
    return { gameId: game.gameId, passed: runs.every((r) => r.passed), runs, failures };
  }

  async function replayRecord(target: string, input: { action: 'start' | 'stop'; name?: string; seed?: number }) {
    const game = await need(target);
    if (input.action === 'start') {
      const seed = input.seed ?? 1;
      const page = await restart(game.gameId, seed);
      const started = await evalWithTimeout((code) => page.evaluate(code), 'window.__midnite.replay.record() === true', 2000, 'replay.record()');
      if (started !== true) throw new McpToolError('error', 'The game could not start recording (is a replay playing?).');
      await deps.setRunState?.(game.gameId, 'resume');
      return { gameId: game.gameId, recording: true, seed };
    }
    if (!input.name) throw new McpToolError('error', 'Name the replay to stop recording (`name`).');
    const page = running(game.gameId);
    const value = parsePageJson(
      await evalWithTimeout((code) => page.evaluate(code), 'JSON.stringify(window.__midnite.replay.stop())', 5000, 'replay.stop()'),
      'replay.stop()',
    );
    if (value === null) throw new McpToolError('error', 'Nothing is being recorded — start with action "start".');
    const parsed = GameReplaySchema.safeParse(value);
    if (!parsed.success) throw new McpToolError('error', clipError(`The recording is not a valid replay (${firstIssue(parsed.error)}).`));
    await deps.setRunState?.(game.gameId, 'pause');
    const path = `${GAME_REPLAYS_DIR}/${input.name}.replay.json`;
    await writeRepoFile(game.path, path, `${JSON.stringify(parsed.data, null, 2)}\n`);
    return { gameId: game.gameId, recording: false, path, frames: parsed.data.frames, events: parsed.data.events.length };
  }

  async function replayPlay(target: string, input: { replay: string | GameReplay; speed: 1 | 'max' }) {
    const game = await need(target);
    const replay = await resolveReplay(game.path, input.replay);
    const page = await restart(game.gameId, replay.seed);
    if (input.speed === 'max') {
      await loadReplay(page, replay);
      await seek(page, replay.frames);
    } else {
      const answer = parsePageJson(
        await evalWithTimeout(
          (code) => page.evaluate(code),
          `window.__midnite.replay.play(${JSON.stringify(replay)}, { speed: 1 }).then((r) => JSON.stringify(r))`,
          Math.ceil((replay.frames / 60) * 1000) * 2 + 10_000,
          'replay.play()',
        ),
        'replay.play()',
      ) as { ok?: unknown; message?: unknown };
      if (answer.ok !== true) throw new McpToolError('error', clipError(typeof answer.message === 'string' ? answer.message : 'The replay did not play.'));
    }
    await deps.setRunState?.(game.gameId, 'pause');
    const state: GameState = await readGameState((code) => page.evaluate(code));
    return { gameId: game.gameId, frames: replay.frames, state };
  }

  async function assertState(target: string, input: { frame: number; path: string; op: JsonPathOp; value?: unknown; epsilon?: number }) {
    const game = await need(target);
    const page = running(game.gameId);
    try {
      await seek(page, input.frame);
    } catch (caught) {
      return { gameId: game.gameId, ok: false, status: 'error' as const, message: caught instanceof Error ? caught.message : String(caught) };
    }
    await deps.setRunState?.(game.gameId, 'pause');
    const state = await readGameState((code) => page.evaluate(code));
    const verdict = evaluateStateAssertion(state, stateAssertion(input));
    return {
      gameId: game.gameId,
      ok: verdict.ok,
      status: verdict.ok ? ('pass' as const) : ('fail' as const),
      message: verdict.message,
      ...('actual' in verdict ? { actual: verdict.actual } : {}),
    };
  }

  async function assertFrame(target: string, input: { frame: number; name: string; tolerance: number }) {
    const game = await need(target);
    const page = running(game.gameId);
    await seek(page, input.frame);
    await deps.setRunState?.(game.gameId, 'pause');
    const check = await checkFrame(game.path, page, input.name, input.frame, input.tolerance);
    return {
      gameId: game.gameId,
      ok: check.status !== 'fail',
      status: check.status,
      message: check.message,
      baseline: baselineFile(input.name, input.frame),
      ...(check.changedFraction === undefined ? {} : { changedFraction: check.changedFraction }),
      png: check.png,
      ...(check.diffPng ? { diffPng: check.diffPng } : {}),
    };
  }

  return { list, run, replayRecord, replayPlay, assertState, assertFrame };
}

export type Playtests = ReturnType<typeof createPlaytests>;

function stateAssertion(a: { path: string; op: JsonPathOp; value?: unknown; epsilon?: number }) {
  return { path: a.path, op: a.op, ...(a.value === undefined ? {} : { value: a.value }), ...(a.epsilon === undefined ? {} : { epsilon: a.epsilon }) };
}
