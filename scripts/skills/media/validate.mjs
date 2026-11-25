#!/usr/bin/env node
// `--no-llm` is accepted as a documented no-op: this script never calls an LLM, so a skill step can add it everywhere.
// Media input validators (Phase 151 Theme E). Enforces the constraints the midnite-media-* skills document,
// before an agent spends a generation on a request the app would refuse.
//
//   node scripts/skills/media/validate.mjs <audio|image|docs|sfx|model|terrain> '<json>' | file.json [--json]
//
// Each validator returns `{ok, errors:[{path,message}]}`; nothing here touches the filesystem or network.

const err = (path, message) => ({ path, message });
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const range = (errors, path, v, lo, hi, { int = false } = {}) => {
  if (v === undefined) return;
  if (!isNum(v) || (int && !Number.isInteger(v)) || v < lo || v > hi) errors.push(err(path, `must be ${int ? 'an integer ' : ''}${lo}-${hi}`));
};
const maxLen = (errors, path, v, n) => {
  if (v === undefined) return;
  if (typeof v !== 'string') errors.push(err(path, 'must be a string'));
  else if (v.length > n) errors.push(err(path, `at most ${n} characters (got ${v.length})`));
};

export const IMAGE_ASPECTS = ['1:1', '3:2', '2:3', '16:9', '9:16'];
export const IMAGE_PROVIDERS = ['gemini', 'openai', 'agy', 'ollama'];
export const TERRAIN_RESOLUTIONS = [129, 257, 513, 1025, 2049, 4097];
export const TERRAIN_MANAGED = ['inputs', 'version', 'lastBuild', 'createdAt', 'updatedAt'];
export const MAP_SIDE_MIN = 16;
export const MAP_SIDE_MAX = 65536;

export function validateAudio(i = {}) {
  const e = [];
  maxLen(e, 'title', i.title, 120);
  if (i.styleTags !== undefined) {
    if (!Array.isArray(i.styleTags)) e.push(err('styleTags', 'must be an array'));
    else {
      if (i.styleTags.length > 12) e.push(err('styleTags', 'at most 12 tags'));
      i.styleTags.forEach((t, k) => maxLen(e, `styleTags[${k}]`, t, 40));
    }
  }
  maxLen(e, 'lyrics', i.lyrics, 5000);
  maxLen(e, 'prompt', i.prompt, 400);
  range(e, 'duration', i.duration, 10, 480);
  range(e, 'variants', i.variants, 1, 4, { int: true });
  return done(e);
}

export function validateImage(i = {}) {
  const e = [];
  if (i.prompt === undefined || i.prompt === '') e.push(err('prompt', 'required'));
  maxLen(e, 'prompt', i.prompt, 4000);
  range(e, 'count', i.count, 1, 4, { int: true });
  if (i.aspect !== undefined && !IMAGE_ASPECTS.includes(i.aspect)) e.push(err('aspect', `one of ${IMAGE_ASPECTS.join(', ')}`));
  if (i.provider !== undefined && !IMAGE_PROVIDERS.includes(i.provider)) e.push(err('provider', `one of ${IMAGE_PROVIDERS.join(', ')}`));
  return done(e);
}

/** `project` is one folder (single segment, no leading dot); `file` must not be an app-owned `.thread.json`. */
export function validateDocs(i = {}) {
  const e = [];
  if (i.project !== undefined && (!i.project || /[\\/]/.test(i.project) || i.project.startsWith('.') || i.project.includes('\0'))) {
    e.push(err('project', 'a single path segment with no leading dot'));
  }
  if (i.file !== undefined && /\.thread\.json$/i.test(i.file)) e.push(err('file', '.thread.json is app-owned — never create or edit it'));
  if (i.file !== undefined && !/\.md$/i.test(i.file) && !/\.thread\.json$/i.test(i.file)) e.push(err('file', 'documents are .md files'));
  if (i.markdown !== undefined) {
    const h1 = String(i.markdown).split('\n').filter((l) => /^#\s+\S/.test(l)).length;
    if (h1 !== 1) e.push(err('markdown', `exactly one "# Title" heading (found ${h1})`));
  }
  return done(e);
}

export function validateSfx(i = {}) {
  const e = [];
  if (i.prompt === undefined || i.prompt === '') e.push(err('prompt', 'required'));
  range(e, 'seconds', i.seconds, 0.5, 11.8);
  range(e, 'steps', i.steps, 1, 32, { int: true });
  range(e, 'cfgScale', i.cfgScale, 1, 7);
  range(e, 'variations', i.variations, 1, 4, { int: true });
  range(e, 'seed', i.seed, 0, 2147483647, { int: true });
  if (i.negativePrompt && !(isNum(i.cfgScale) && i.cfgScale > 1)) e.push(err('negativePrompt', 'only takes effect with cfgScale > 1'));
  return done(e);
}

export function validateModel(i = {}) {
  const e = [];
  if (i.parts !== undefined && !Array.isArray(i.parts)) e.push(err('parts', 'must be an array of primitives'));
  if (i.bake?.size !== undefined && !(isNum(i.bake.size) && i.bake.size > 0 && i.bake.size <= 4096)) e.push(err('bake.size', 'at most 4096 (try 1024 first)'));
  if (i.targetTriangles !== undefined && !(Number.isInteger(i.targetTriangles) && i.targetTriangles > 0)) e.push(err('targetTriangles', 'positive integer'));
  if (i.ratio !== undefined) range(e, 'ratio', i.ratio, 0.001, 1);
  return done(e);
}

export function validateTerrain(i = {}, { patch = false } = {}) {
  const e = [];
  if (patch) for (const k of TERRAIN_MANAGED) if (k in i) e.push(err(k, 'app-managed — rejected in a patch'));
  if (i.resolution !== undefined && !TERRAIN_RESOLUTIONS.includes(i.resolution)) e.push(err('resolution', `one of ${TERRAIN_RESOLUTIONS.join(', ')}`));
  range(e, 'worldSize', i.worldSize, MAP_SIDE_MIN, MAP_SIDE_MAX);
  if (i.heightRange !== undefined) {
    const h = i.heightRange;
    if (!Array.isArray(h) || h.length !== 2 || !h.every(isNum) || h[0] >= h[1]) e.push(err('heightRange', '[min, max] metres with min < max'));
  }
  if (i.seaLevel !== undefined && !isNum(i.seaLevel)) e.push(err('seaLevel', 'must be a number'));
  return done(e);
}

const done = (errors) => ({ ok: errors.length === 0, errors });

export const VALIDATORS = { audio: validateAudio, image: validateImage, docs: validateDocs, sfx: validateSfx, model: validateModel, terrain: validateTerrain };

export async function main(argv = process.argv.slice(2), out = (s) => process.stdout.write(`${s}\n`)) {
  const { readFileSync, existsSync } = await import('node:fs');
  const [kind, src] = argv.filter((a) => !a.startsWith('--'));
  const fn = VALIDATORS[kind];
  if (!fn || !src) return out(`usage: validate.mjs <${Object.keys(VALIDATORS).join('|')}> '<json>'|file.json [--json]`), 2;
  let input;
  try {
    input = JSON.parse(existsSync(src) ? readFileSync(src, 'utf8') : src);
  } catch (x) {
    return out(`invalid JSON: ${x.message}`), 2;
  }
  const r = fn(input, { patch: argv.includes('--patch') });
  out(argv.includes('--json') ? JSON.stringify(r) : r.ok ? `ok (${kind})` : r.errors.map((x) => `${x.path}: ${x.message}`).join('\n'));
  return r.ok ? 0 : 1;
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) main().then((c) => { process.exitCode = c; });
