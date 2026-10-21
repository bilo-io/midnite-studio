import {
  alphaBounds,
  backgroundBlocker,
  backgroundLayerFile,
  backgroundLayerPrompt,
  buildBackgroundJson,
  createRgba,
  crop,
  ensureSeamless,
  handDrawnProvider,
  hasPartialAlpha,
  isOpaqueLayer,
  keyChroma,
  mapToPalette,
  medianCut,
  nearestAspect,
  opaqueFraction,
  propPrompt,
  resizeArea,
  resizeNearest,
  SPRITE_DEFAULT_PALETTE_SIZE,
  spriteBackgroundRequest,
  thresholdAlpha,
  type BackgroundSpec,
  type PropSheetSpec,
  type RgbaImage,
  type SpriteAssetSpec,
  type SpriteGenerateRequest,
} from '@midnite/studio-shared';

import { decodeFrame } from './frame-pipeline';
import { encodeImage, failureMessage, reportOf, type EnvironmentDeps } from './tileset';
import type { SpriteJobContext, SpriteJobRunner } from './sprite-service';

/**
 * Phase 106 Theme I: parallax backgrounds and prop sheets.
 *
 * **Backgrounds.** One request per layer. `sky` is opaque; every other layer is asked for on a removable
 * background (real alpha where the provider returns it, else a chroma key) and keyed to transparent. Each
 * layer is resized to the background's size and must pass `seamScore(img, 'x')` — repaired with a
 * cross-fade when it does not, and drawn once more when the repair is not enough, keeping the better with
 * a `seam` warning. Files: `layers/<name>.png`, `background.json` (`{ version, size, layers: [{ image, scrollFactor }] }`).
 *
 * **Prop sheets.** One request per prop; each is keyed, cropped to its alpha bounds and fitted to the
 * cell, bottom-centred, as `props/<name>/000.png` (no anchor-drift rule — a prop is not a character).
 * Export packs them with the sprite packer (Theme G).
 */
export const BACKGROUND_SEAM_REDRAWS = 1;
export const PROP_MARGIN = 1;

export function backgroundPreflight(spec: SpriteAssetSpec, req: Pick<SpriteGenerateRequest, 'turnaround'>): string | null {
  if (spec.kind !== 'background' || req.turnaround) return null;
  return backgroundBlocker(spec);
}

export function propsPreflight(spec: SpriteAssetSpec, req: Pick<SpriteGenerateRequest, 'turnaround'>): string | null {
  if (spec.kind !== 'prop-sheet' || req.turnaround) return null;
  if (spec.props.length === 0) return 'Add at least one prop first.';
  const names = spec.props.map((p) => p.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  return dup ? `Two props are called ${dup}.` : null;
}

/** An image on a removable background → real alpha. */
function cutOut(image: RgbaImage, bg: ReturnType<typeof spriteBackgroundRequest>): RgbaImage {
  return bg.transparent || hasPartialAlpha(image) ? image : keyChroma(image, bg.chroma);
}

async function drawLayer(ctx: SpriteJobContext, deps: EnvironmentDeps, spec: BackgroundSpec, layer: BackgroundSpec['layers'][number], count: () => void): Promise<{ image: RgbaImage; score: number; passes: boolean }> {
  const { provider, model } = handDrawnProvider(spec);
  const opaque = isOpaqueLayer(layer.name);
  const bg = spriteBackgroundRequest(provider, `${layer.prompt} ${spec.prompt}`);
  const prompt = backgroundLayerPrompt(spec, layer, { opaque, chroma: bg.transparent ? null : bg.chroma });
  const aspect = nearestAspect(spec.size[0], spec.size[1]);
  const pixel = spec.style === 'pixel';
  let best: { image: RgbaImage; score: number; passes: boolean } | null = null;
  for (let attempt = 0; attempt <= BACKGROUND_SEAM_REDRAWS; attempt += 1) {
    if (ctx.signal.aborted) throw new Error('cancelled');
    count();
    const result = await deps.generateImage({ provider, model, prompt, aspect, ...(!opaque && bg.transparent ? { transparent: true } : {}), signal: ctx.signal });
    if (!result.ok) throw new Error(failureMessage(result));
    const drawn = await decodeFrame(result.value.bytes, deps.toPng);
    const keyed = opaque ? drawn : cutOut(drawn, bg);
    const sized = pixel ? thresholdIf(resizeNearest(keyed, spec.size[0], spec.size[1]), !opaque) : resizeArea(keyed, spec.size[0], spec.size[1]);
    const checked = ensureSeamless(sized, 'x');
    if (!best || checked.score < best.score) best = { image: checked.image, score: checked.score, passes: checked.passes };
    if (best.passes) break;
  }
  return best!;
}

const thresholdIf = (img: RgbaImage, on: boolean): RgbaImage => (on ? thresholdAlpha(img) : img);

export function createBackgroundRunner(deps: EnvironmentDeps): SpriteJobRunner {
  return async (ctx) => {
    const spec = ctx.spec;
    if (spec.kind !== 'background') throw new Error('Only a background is built here.');
    const blocked = backgroundBlocker(spec);
    if (blocked) throw new Error(blocked);
    const total = spec.layers.length + 1;
    const failing: string[] = [];
    let done = 0;
    for (const layer of spec.layers) {
      ctx.progress({ done, total, stage: 'generating', frame: layer.name });
      const out = await drawLayer(ctx, deps, spec, layer, () => ctx.countRequest());
      await ctx.writeAssetFile(backgroundLayerFile(layer.name), encodeImage(out.image));
      if (!out.passes) failing.push(layer.name);
      done += 1;
    }
    ctx.progress({ done, total, stage: 'packing' });
    await ctx.writeAssetFile('background.json', Buffer.from(`${JSON.stringify(buildBackgroundJson(spec), null, 2)}\n`, 'utf8'));
    if (failing.length > 0) ctx.note(`Seam warning: ${failing.join(', ')} still show a seam after repair.`);
    await reportOf(ctx, deps, spec.layers.length, failing.length);
    ctx.progress({ done: total, total, stage: 'packing' });
  };
}

/** A keyed prop cropped to its bounds and fitted bottom-centre into the cell. */
export function fitProp(keyed: RgbaImage, cell: readonly [number, number], pixel: boolean): RgbaImage | null {
  const box = alphaBounds(keyed);
  if (!box) return null;
  const part = crop(keyed, box);
  const room = [cell[0] - 2 * PROP_MARGIN, cell[1] - 2 * PROP_MARGIN] as const;
  const scale = Math.min(room[0] / part.width, room[1] / part.height);
  const w = Math.max(1, Math.round(part.width * scale));
  const h = Math.max(1, Math.round(part.height * scale));
  const scaled = pixel ? thresholdAlpha(resizeNearest(part, w, h)) : resizeArea(part, w, h);
  const out = createRgba(cell[0], cell[1]);
  const ox = Math.floor((cell[0] - w) / 2), oy = cell[1] - PROP_MARGIN - h;
  for (let y = 0; y < h; y += 1) out.data.set(scaled.data.subarray(y * w * 4, (y + 1) * w * 4), ((oy + y) * cell[0] + ox) * 4);
  return out;
}

export function createPropsRunner(deps: EnvironmentDeps): SpriteJobRunner {
  return async (ctx) => {
    const spec = ctx.spec;
    if (spec.kind !== 'prop-sheet') throw new Error('Only a prop sheet is built here.');
    const blocked = propsPreflight(spec, {});
    if (blocked) throw new Error(blocked);
    const { provider, model } = handDrawnProvider(spec);
    const pixel = spec.style === 'pixel';
    const aspect = nearestAspect(spec.cell[0], spec.cell[1]);
    const palette = spec.palette && 'colours' in spec.palette ? spec.palette.colours : undefined;
    const total = spec.props.length;
    const fitted: Array<{ name: string; image: RgbaImage | null }> = [];
    for (const [i, prop] of spec.props.entries()) {
      if (ctx.signal.aborted) throw new Error('cancelled');
      ctx.progress({ done: i, total, stage: 'generating', frame: prop.name });
      const bg = spriteBackgroundRequest(provider, `${prop.prompt} ${spec.prompt}`, palette);
      ctx.countRequest();
      const result = await deps.generateImage({ provider, model, prompt: propPrompt(spec, prop, { chroma: bg.transparent ? null : bg.chroma }), aspect, ...(bg.transparent ? { transparent: true } : {}), signal: ctx.signal });
      if (!result.ok) throw new Error(failureMessage(result));
      const drawn = await decodeFrame(result.value.bytes, deps.toPng);
      fitted.push({ name: prop.name, image: fitProp(cutOut(drawn, bg), spec.cell, pixel) });
    }
    ctx.progress({ done: total, total, stage: 'processing' });
    let images = fitted.map((f) => f.image);
    if (pixel) {
      const present = images.filter((i): i is RgbaImage => i !== null);
      const fixed = palette;
      const size = spec.palette && 'size' in spec.palette ? spec.palette.size : SPRITE_DEFAULT_PALETTE_SIZE;
      if (present.length > 0) {
        const colours = fixed ?? medianCut(present.map((i) => i.data), size);
        images = images.map((i) => (i ? mapToPalette(i, colours) : i));
        if (!fixed) await ctx.updateAsset((current) => (current.kind === 'prop-sheet' ? ({ ...current, palette: { colours } } as PropSheetSpec) : current));
      }
    }
    const empty: string[] = [];
    for (const [i, f] of fitted.entries()) {
      const image = images[i];
      if (!image || opaqueFraction(image) < 0.01) {
        empty.push(f.name);
        continue;
      }
      await ctx.writeAssetFile(`props/${f.name}/000.png`, encodeImage(image));
    }
    if (empty.length > 0) ctx.note(`Nothing was drawn for ${empty.join(', ')}.`);
    await reportOf(ctx, deps, total - empty.length, empty.length);
  };
}
