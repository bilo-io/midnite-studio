#!/usr/bin/env node
// `--no-llm` is accepted as a documented no-op: this script never calls an LLM, so a skill step can add it everywhere.
// Sprite job maths (Phase 151 Theme E): the 200-request spend cap and the method choice.
//
//   node scripts/skills/media/sprite-calc.mjs --frames 8 --directions 4 [--reroll 1] [--view top-down] [--style pixel] [--json]
import { fileURLToPath } from 'node:url';

export const SPEND_CAP = 200;
export const ONE_SHOT_MAX_FRAMES = 8;
export const ONE_SHOT_MAX_ROWS = 8;

/** Provider requests a job can make counting every re-roll: frames x directions x (1 + rerollBudget). */
export const spend = ({ frames, directions = 1, reroll = 0 }) => frames * directions * (1 + reroll);

/** Largest `frames` per job that stays within the cap for the given directions / reroll budget. */
export const maxFrames = ({ directions = 1, reroll = 0 }) => Math.floor(SPEND_CAP / (directions * (1 + reroll)));

/** Check a job against the cap, with the cheapest ways to bring an over-cap job back under it. */
export function checkSpend({ frames, directions = 1, reroll = 0 }) {
  const requests = spend({ frames, directions, reroll });
  if (requests <= SPEND_CAP) return { ok: true, requests, cap: SPEND_CAP };
  const hints = [`generate at most ${maxFrames({ directions, reroll })} frames per job (a few clips at a time)`];
  if (directions > 1) hints.push('use fewer directions');
  if (reroll > 0) hints.push('lower consistency.rerollBudget');
  return { ok: false, requests, cap: SPEND_CAP, hints };
}

/**
 * Method per the skill: rendered for 4/8-direction top-down / isometric with a rigged model reference;
 * hand-drawn for side-scrollers and painterly styles; one-shot only when the sheet fits 8x8, else hand-drawn.
 */
export function recommendMethod({ view = 'side', directions = 1, frames = 1, rows = 1, style = '', hasModelReference = false } = {}) {
  const topdown = /top|iso/i.test(view);
  if (topdown && directions >= 4 && hasModelReference) return { method: 'rendered', why: 'every direction must match; frames render from the rigged model at no image cost' };
  if (/paint|hand/i.test(style) || /side/i.test(view)) {
    if (frames <= ONE_SHOT_MAX_FRAMES && rows <= ONE_SHOT_MAX_ROWS && !/paint|hand/i.test(style)) return { method: 'one-shot', why: 'small sheet; fast when grid detection agrees (fall back to hand-drawn if it fails)' };
    return { method: 'hand-drawn', why: 'frame by frame against a locked reference' };
  }
  if (frames > ONE_SHOT_MAX_FRAMES || rows > ONE_SHOT_MAX_ROWS) return { method: 'hand-drawn', why: `sheet exceeds one-shot's ${ONE_SHOT_MAX_FRAMES}x${ONE_SHOT_MAX_ROWS}` };
  return { method: 'one-shot', why: 'fits one-shot' };
}

export function main(argv = process.argv.slice(2), out = (s) => process.stdout.write(`${s}\n`)) {
  const get = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const frames = Number(get('--frames'));
  if (!Number.isFinite(frames)) return out('usage: sprite-calc.mjs --frames N [--directions N] [--reroll N] [--rows N] [--view V] [--style S] [--model-ref] [--json]'), 2;
  const directions = Number(get('--directions') ?? 1);
  const reroll = Number(get('--reroll') ?? 0);
  const check = checkSpend({ frames, directions, reroll });
  const method = recommendMethod({ view: get('--view'), directions, frames, rows: Number(get('--rows') ?? directions), style: get('--style') ?? '', hasModelReference: argv.includes('--model-ref') });
  out(argv.includes('--json') ? JSON.stringify({ ...check, ...method }) : `${check.requests}/${SPEND_CAP} requests ${check.ok ? 'ok' : 'OVER CAP'} · method ${method.method} (${method.why})${check.hints ? `\n${check.hints.map((h) => `- ${h}`).join('\n')}` : ''}`);
  return check.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
