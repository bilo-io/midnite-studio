import {
  buildScene,
  fitReferenceView,
  MCP_CONTENT_KEY,
  modelAssetPath,
  overallScore,
  overlayMasks,
  planReferencePass,
  rasterizeMask,
  referenceCamera,
  scoreView,
  segmentSilhouette,
  type McpContentBlock,
  type McpToolInput,
  type McpToolOutput,
  type ModelSidecar,
  type ReferenceView,
  type ReferenceViews,
  type ViewScore,
} from '@midnite/studio-shared';

import { McpToolError } from '../../mcp/errors';
import { decodePng, encodePngRgba8 } from '../png/png-codec';
import { designDir } from './model-assets';
import type { LoadedModel, MeshToolEnv } from './sculpt-tools';
import { ensurePartIds } from './spec-ops';

/**
 * The reference-driven agent loop's tools (Phase 104 Theme H): `model_set_reference_views` registers the user's
 * picture to the model (a hand-written orthographic camera, or one fitted to a height), and
 * `model_compare_reference` scores the model against it — silhouette IoU, a width profile along the up axis,
 * named regions that are too wide or narrow, an overlay image — and plans the next pass from the history of scores.
 *
 * The picture is decoded once per file (PNG natively, anything else through the injected `decodeImage`) and
 * reduced by an integer factor to at most {@link MAX_SIDE} px, with the matched view's scale and offset divided by
 * the same factor, so the comparison runs in the picture's frame whatever its resolution.
 */

export const REFERENCE_MAX_SIDE = 1024;
type Rgba = { width: number; height: number; data: Uint8Array };
type EditOk = Extract<McpToolOutput<'model_set_reference_views'>, { ok: true }>;

const text = (value: string): McpContentBlock => ({ type: 'text', text: value });
const fail = (path: string, message: string): { ok: false; errors: { path: string; message: string }[] } => ({ ok: false, errors: [{ path, message }] });

/** Box-averages `image` down by an integer factor so its longer side is at most `limit`. */
export function reduceImage(image: Rgba, limit = REFERENCE_MAX_SIDE): { image: Rgba; factor: number } {
  const factor = Math.max(1, Math.ceil(Math.max(image.width, image.height) / limit));
  if (factor === 1) return { image, factor };
  const width = Math.floor(image.width / factor);
  const height = Math.floor(image.height / factor);
  const data = new Uint8Array(width * height * 4);
  const n = factor * factor;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sum = [0, 0, 0, 0];
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          const o = ((y * factor + dy) * image.width + x * factor + dx) * 4;
          for (let c = 0; c < 4; c += 1) sum[c]! += image.data[o + c]!;
        }
      }
      for (let c = 0; c < 4; c += 1) data[(y * width + x) * 4 + c] = Math.round(sum[c]! / n);
    }
  }
  return { image: { width, height, data }, factor };
}

export function createReferenceTools(env: MeshToolEnv) {
  const { deps } = env;
  const history = new Map<string, number[]>();

  /** The picture a view is matched to, decoded and reduced. */
  async function readPicture(l: LoadedModel, sidecar: ModelSidecar, file: string | undefined): Promise<{ image: Rgba; factor: number; name: string }> {
    const name = file ?? sidecar.reference;
    if (!name) throw new McpToolError('not-found', 'No reference picture is attached to this model, and the view names none.');
    const read = await deps.readBytes({ ...l.scope, path: modelAssetPath(designDir(l.stem), name) });
    if (!read.ok) throw new McpToolError('not-found', `The reference picture "${name}" is missing from the model's folder.`);
    const bytes = new Uint8Array(read.value.buffer, read.value.byteOffset, read.value.byteLength);
    let rgba: Rgba | null = null;
    const png = decodePng(bytes);
    if (png.ok) {
      const { width, height, channels, bitDepth, data } = png.image;
      if (bitDepth !== 8) throw new McpToolError('error', `The reference picture "${name}" is ${bitDepth}-bit; save it as an 8-bit PNG or JPEG.`);
      rgba = { width, height, data: toRgba(data as Uint8Array, width * height, channels) };
    } else if (deps.decodeImage) {
      rgba = await deps.decodeImage(read.value, mimeOf(name));
    }
    if (!rgba) throw new McpToolError('error', `The reference picture "${name}" could not be decoded; use a PNG or JPEG.`);
    return { ...reduceImage(rgba), name };
  }

  /** `model_set_reference_views`. */
  async function modelSetReferenceViews(input: McpToolInput<'model_set_reference_views'>): Promise<McpToolOutput<'model_set_reference_views'>> {
    const l = await env.load(input);
    const sidecar = env.need(l, input);
    return env.locked(env.keyOf(l), async () => {
      if (!input.views && !input.fit && !input.clear) return fail('views', 'Give `views`, or `fit` to register a picture to a height, or `clear`.');
      let views: ReferenceViews | undefined = sidecar.spec.referenceViews;
      let note = '';
      if (input.clear) views = undefined;
      if (input.views) views = input.views;
      if (input.fit) {
        const { image, factor, name } = await readPicture(l, sidecar, input.fit.image);
        const mask = segmentSilhouette(image.data, image.width, image.height);
        const fitted = fitReferenceView(mask, input.fit.view, input.fit.height, input.fit.bottom ?? 0);
        if (!fitted) return fail('fit', `Nothing in "${name}" stands out from its background, so there is no silhouette to fit. Supply a cut-out PNG with transparency.`);
        const view: ReferenceView = {
          view: fitted.view,
          scale: round(fitted.scale * factor),
          offset: [round(fitted.offset[0] * factor), round(fitted.offset[1] * factor)],
          ...(input.fit.image ? { image: input.fit.image } : {}),
        };
        views = [...(views ?? []).filter((v) => v.view !== view.view), view];
        note = `Fitted ${view.view}: ${round(view.scale)} px per metre, origin at (${view.offset.join(', ')}).`;
      }
      const spec = { ...sidecar.spec, ...(views ? { referenceViews: views } : {}) };
      if (!views) delete (spec as { referenceViews?: unknown }).referenceViews;
      const written = (await env.writeEdit(l, sidecar, spec, { keepCameras: true })) as EditOk;
      history.delete(env.keyOf(l));
      return { ...written, ...(views ? { referenceViews: views } : {}), ...(note ? { warnings: [{ path: 'fit', message: note }] } : {}) };
    }) as Promise<McpToolOutput<'model_set_reference_views'>>;
  }

  /** `model_compare_reference`. */
  async function modelCompareReference(input: McpToolInput<'model_compare_reference'>): Promise<McpToolOutput<'model_compare_reference'>> {
    const l = await env.load(input);
    const sidecar = env.need(l, input);
    const all = sidecar.spec.referenceViews;
    if (!all?.length) throw new McpToolError('refused', 'No reference views are matched yet — call model_set_reference_views first (with `fit` and the subject’s height is the quickest way).');
    const chosen = input.views ? all.filter((v) => input.views!.includes(v.view)) : all;
    if (!chosen.length) throw new McpToolError('not-found', `None of the requested views is matched; matched: ${all.map((v) => v.view).join(', ')}.`);
    const parts = buildScene(ensurePartIds(sidecar.spec)).filter((p) => p.role === 'solid');
    const scores: ViewScore[] = [];
    const images: McpContentBlock[] = [];
    for (const view of chosen) {
      const { image, factor } = await readPicture(l, sidecar, view.image);
      const matched = { view: view.view, scale: view.scale / factor, offset: [view.offset[0] / factor, view.offset[1] / factor] as [number, number] };
      const reference = segmentSilhouette(image.data, image.width, image.height, input.threshold === undefined ? {} : { threshold: input.threshold });
      const camera = referenceCamera(matched, image.width);
      const model = rasterizeMask(parts, camera, image.width, image.height);
      scores.push(scoreView(view.view, reference, model, camera, input.tolerance));
      if (input.overlay !== false) {
        const overlay = overlayMasks(reference, model);
        images.push(text(`${view.view} overlay: red = only in the reference, blue = only in the model, grey = both`), {
          type: 'image',
          data: encodePngRgba8(overlay.data, overlay.width, overlay.height).toString('base64'),
          mimeType: 'image/png',
        });
      }
    }
    const score = overallScore(scores);
    const key = env.keyOf(l);
    if (input.reset) history.delete(key);
    const scoresSoFar = [...(history.get(key) ?? []), score];
    history.set(key, scoresSoFar);
    const plan = input.budget === undefined ? null : planReferencePass(scoresSoFar, input.budget);
    const summary = {
      score: round(score, 4),
      pass: scoresSoFar.length - 1,
      history: scoresSoFar.map((s) => round(s, 4)),
      views: scores.map((s) => ({
        view: s.view,
        score: round(s.score, 4),
        iou: round(s.iou, 4),
        profile: round(s.profile, 4),
        ...(s.height ? { height: s.height.advice } : {}),
        regions: s.regions.map((r) => r.advice),
      })),
      ...(plan ? { loop: plan } : {}),
    };
    return { [MCP_CONTENT_KEY]: [text(JSON.stringify(summary)), ...images] } as McpToolOutput<'model_compare_reference'>;
  }

  return { model_set_reference_views: modelSetReferenceViews, model_compare_reference: modelCompareReference };
}

const round = (n: number, digits = 3): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const mimeOf = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
};

/** Grey, grey+alpha, RGB or RGBA → RGBA. */
function toRgba(data: Uint8Array, pixels: number, channels: number): Uint8Array {
  if (channels === 4) return data;
  const out = new Uint8Array(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    const r = data[i * channels]!;
    out[i * 4] = r;
    out[i * 4 + 1] = channels >= 3 ? data[i * channels + 1]! : r;
    out[i * 4 + 2] = channels >= 3 ? data[i * channels + 2]! : r;
    out[i * 4 + 3] = channels === 2 ? data[i * channels + 1]! : 255;
  }
  return out;
}
