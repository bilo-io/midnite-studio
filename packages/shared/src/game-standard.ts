import { z } from 'zod';

/**
 * Phase 149 Theme A: the Midnite game standard as data. `docs/GAME_STANDARD.md` carries the prose and a rule
 * table; `game-standard.test.ts` fails when the two disagree, so the doc, the doctor and the skill cannot drift.
 * A rule is checked, never enforced at list time: a game that fails one still lists and runs if it can.
 */

export const GAME_RULE_IDS = [
  'manifest.missing',
  'manifest.invalid-json',
  /** One finding per schema issue. */
  'manifest.schema',
  'manifest.vendored-legacy',
  'manifest.genre-unknown',
  'entry.missing',
  'entry.bundled-without-build',
  'entry.build-out-missing',
  'kit.missing',
  'kit.outdated',
  'kit.hook-missing',
  'levels.none',
  'levels.not-declared',
  'levels.start-missing',
  'levels.invalid',
  'assets.unlisted',
  'assets.missing-file',
  'assets.hash-mismatch',
] as const;
export const GameRuleIdSchema = z.enum(GAME_RULE_IDS);
export type GameRuleId = z.infer<typeof GameRuleIdSchema>;

export const GameRuleLevelSchema = z.enum(['error', 'warn', 'info']);
export type GameRuleLevel = z.infer<typeof GameRuleLevelSchema>;

export const GAME_RULE_AREAS = ['manifest', 'entry', 'kit', 'levels', 'assets'] as const;
export const GameRuleAreaSchema = z.enum(GAME_RULE_AREAS);
export type GameRuleArea = z.infer<typeof GameRuleAreaSchema>;

export type GameRule = {
  level: GameRuleLevel;
  area: GameRuleArea;
  title: string;
  /** The Games feature that needs the rule: "Run", "Level editor", "Scene jump", "Asset resync"... */
  unlocks: string;
  fix: string;
};

export const GAME_RULES: Record<GameRuleId, GameRule> = {
  'manifest.missing': {
    level: 'error',
    area: 'manifest',
    title: 'midnite-game.json is missing',
    unlocks: 'Listing, Run, every Games feature',
    fix: 'Write a manifest at the repo root (the doctor can infer one).',
  },
  'manifest.invalid-json': {
    level: 'error',
    area: 'manifest',
    title: 'midnite-game.json is not valid JSON',
    unlocks: 'Listing, Run, every Games feature',
    fix: 'Repair the JSON syntax.',
  },
  'manifest.schema': {
    level: 'error',
    area: 'manifest',
    title: 'A manifest field is missing or has the wrong shape',
    unlocks: 'Listing, Run, every Games feature',
    fix: 'Correct the field named by the finding.',
  },
  'manifest.vendored-legacy': {
    level: 'warn',
    area: 'manifest',
    title: '`vendored` is `true` instead of an object of engine versions',
    unlocks: 'Engine version checks',
    fix: 'Replace `true` with an object such as `{ "phaser": "3.80.1" }`.',
  },
  'manifest.genre-unknown': {
    level: 'warn',
    area: 'manifest',
    title: '`genre` is not one Midnite knows',
    unlocks: 'Genre options in the editor',
    fix: 'Set a known genre, or `null` for a custom game.',
  },
  'entry.missing': {
    level: 'error',
    area: 'entry',
    title: 'The entry `index.html` does not exist',
    unlocks: 'Run',
    fix: 'Add `index.html` at the repo root, or in `build.out` for a bundled game.',
  },
  'entry.bundled-without-build': {
    level: 'warn',
    area: 'entry',
    title: 'The game needs a bundler but the manifest has no `build`',
    unlocks: 'Run',
    fix: 'Add `build: { command, out }` so Studio builds and serves the output.',
  },
  'entry.build-out-missing': {
    level: 'warn',
    area: 'entry',
    title: '`build.out` does not exist yet',
    unlocks: 'Run',
    fix: 'Run the build command once, or correct `build.out`.',
  },
  'kit.missing': {
    level: 'warn',
    area: 'kit',
    title: 'The `kit/` folder is missing',
    unlocks: 'Play-test hook, scene jump, level editor',
    fix: 'Upgrade the kit.',
  },
  'kit.outdated': {
    level: 'warn',
    area: 'kit',
    title: '`kitVersion` is older than the kit Studio ships',
    unlocks: 'Level editor, scene jump',
    fix: 'Upgrade the kit on a branch.',
  },
  'kit.hook-missing': {
    level: 'warn',
    area: 'kit',
    title: '`window.__midnite` is never installed',
    unlocks: 'Play-test, state read-back, scene jump',
    fix: 'Call `installHook` from the entry module.',
  },
  'levels.none': {
    level: 'info',
    area: 'levels',
    title: 'The game has no `levels/*.tmj`',
    unlocks: 'Level editor',
    fix: 'Move hard-coded layouts into `levels/<scene>.tmj` (agent work; see the skill\'s Levels section).',
  },
  'levels.not-declared': {
    level: 'warn',
    area: 'levels',
    title: '`levels/*.tmj` exist but `manifest.levels` is absent',
    unlocks: 'Level editor',
    fix: 'Declare `levels: { dir: "levels", start: "<scene>" }`.',
  },
  'levels.start-missing': {
    level: 'warn',
    area: 'levels',
    title: '`manifest.levels.start` names a scene with no `.tmj`',
    unlocks: 'Level editor, scene jump',
    fix: 'Point `start` at an existing scene, or add the file.',
  },
  'levels.invalid': {
    level: 'warn',
    area: 'levels',
    title: 'A `.tmj` file does not parse as a level',
    unlocks: 'Level editor',
    fix: 'Repair the level file named by the finding.',
  },
  'assets.unlisted': {
    level: 'info',
    area: 'assets',
    title: 'A file under `assets/` is not in `manifest.assets`',
    unlocks: 'Asset resync, provenance',
    fix: 'Resync the assets so each file is listed with its `sha256`.',
  },
  'assets.missing-file': {
    level: 'warn',
    area: 'assets',
    title: 'A listed asset has no file on disk',
    unlocks: 'Asset resync, Run',
    fix: 'Restore the file or remove the manifest entry.',
  },
  'assets.hash-mismatch': {
    level: 'warn',
    area: 'assets',
    title: 'A listed asset\'s file differs from its `sha256`',
    unlocks: 'Asset resync',
    fix: 'Resync the assets to record the current hash.',
  },
};

/** The six safe fixes the doctor can apply (Theme D); each is one commit on one file. */
export const GAME_FIX_IDS = [
  'write-manifest',
  'normalise-vendored',
  'set-genre',
  'add-build',
  'declare-levels',
  'upgrade-kit',
] as const;
export const GameFixIdSchema = z.enum(GAME_FIX_IDS);
export type GameFixId = z.infer<typeof GameFixIdSchema>;

/**
 * Compare two `x.y.z` versions (a `-pre`/`+build` suffix is ignored for the numbers; a pre-release sorts before its
 * release). Negative when `a < b`, `0` when equal, positive when `a > b`; `null` when either is not a version.
 */
export function compareSemver(a: string, b: string): number | null {
  const parse = (v: string): { nums: [number, number, number]; pre: boolean } | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(?:\+[\w.-]+)?$/.exec(v.trim());
    return m ? { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] !== undefined } : null;
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i += 1) {
    const d = pa.nums[i]! - pb.nums[i]!;
    if (d !== 0) return d;
  }
  return pa.pre === pb.pre ? 0 : pa.pre ? -1 : 1;
}
