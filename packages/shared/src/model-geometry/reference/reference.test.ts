import { describe, expect, it } from 'vitest';

import { fitReferenceView, overlayMasks, rasterizeMask, referenceCamera, scoreView, segmentSilhouette, silhouetteIou, type Mask } from './reference';
import { planReferencePass } from './loop';

/** A box as two triangles per face is overkill: an orthographic front view only needs its front quad. */
const quad = (w: number, h: number, cx: number, y0: number) => ({
  positions: [cx - w / 2, y0, 0, cx + w / 2, y0, 0, cx + w / 2, y0 + h, 0, cx - w / 2, y0 + h, 0],
  indices: [0, 1, 2, 0, 2, 3],
});

const W = 200;
const H = 300;
// 100 px per metre, the model's origin at the picture's bottom-centre.
const view = { view: 'front' as const, scale: 100, offset: [100, 290] as [number, number] };
const camera = referenceCamera(view, W);

/** A figure: legs (0–1 m), torso (1–2 m) and head (2–2.6 m), with the torso `torso` m wide. */
const figure = (torso: number) => [quad(0.4, 1, 0, 0), quad(torso, 1, 0, 1), quad(0.5, 0.6, 0, 2)];
const maskOf = (parts: ReturnType<typeof figure>): Mask => rasterizeMask(parts, camera, W, H);

describe('silhouette scores', () => {
  it('scores identical silhouettes 1 and reports nothing', () => {
    const a = maskOf(figure(1));
    const score = scoreView('front', a, maskOf(figure(1)), camera);
    expect(score.iou).toBe(1);
    expect(score.score).toBeCloseTo(1, 6);
    expect(score.regions).toEqual([]);
    expect(score.height).toBeNull();
  });

  it('puts a rasterised quad where the camera says', () => {
    const mask = rasterizeMask([quad(1, 1, 0, 0)], camera, W, H);
    // 1 m x 1 m at 100 px/m: x 50..150, y 190..290.
    expect(mask.data[240 * W + 100]).toBe(1);
    expect(mask.data[240 * W + 40]).toBe(0);
    expect(mask.data[180 * W + 100]).toBe(0);
    let area = 0;
    for (const v of mask.data) area += v;
    expect(area).toBe(100 * 100);
  });

  it('reports a widened torso as too wide in the torso, and nowhere else', () => {
    const reference = maskOf(figure(0.8));
    const model = maskOf(figure(1.2));
    const score = scoreView('front', reference, model, camera);
    expect(score.iou).toBeLessThan(1);
    expect(score.regions).toHaveLength(1);
    const [region] = score.regions;
    expect(region!.verdict).toBe('too wide');
    // The torso is y 1..2 m.
    expect(region!.up[0]).toBeGreaterThan(0.7);
    expect(region!.up[1]).toBeLessThan(2.3);
    expect(region!.ratio).toBeGreaterThan(1.3);
    expect(region!.ratio).toBeLessThan(1.6);
    expect(region!.advice).toMatch(/too wide/);
  });

  it('reports a narrowed torso as too narrow', () => {
    const score = scoreView('front', maskOf(figure(1.2)), maskOf(figure(0.8)), camera);
    expect(score.regions.map((r) => r.verdict)).toEqual(['too narrow']);
  });

  it('reports a missing head and a short model', () => {
    const reference = maskOf(figure(1));
    const model = maskOf(figure(1).slice(0, 2));
    const score = scoreView('front', reference, model, camera);
    expect(score.regions.some((r) => r.verdict === 'missing')).toBe(true);
    expect(score.height?.verdict).toBe('too short');
    expect(score.height!.delta).toBeCloseTo(-0.6, 1);
  });

  it('scores a worse match lower', () => {
    const reference = maskOf(figure(1));
    const close = scoreView('front', reference, maskOf(figure(1.1)), camera).score;
    const far = scoreView('front', reference, maskOf(figure(2)), camera).score;
    expect(close).toBeGreaterThan(far);
    expect(close).toBeLessThan(1);
  });

  it('draws the overlay in three colours', () => {
    const a: Mask = { width: 2, height: 1, data: Uint8Array.from([1, 1]) };
    const b: Mask = { width: 2, height: 1, data: Uint8Array.from([0, 1]) };
    const o = overlayMasks(a, b);
    expect([...o.data.slice(0, 3)]).toEqual([226, 84, 84]);
    expect([...o.data.slice(4, 7)]).toEqual([96, 96, 104]);
  });

  it('refuses masks of different sizes', () => {
    expect(() => silhouetteIou({ width: 1, height: 1, data: new Uint8Array(1) }, { width: 2, height: 1, data: new Uint8Array(2) })).toThrow();
  });
});

describe('segmentation and fitting', () => {
  const picture = (fill: (x: number, y: number) => [number, number, number, number]) => {
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) data.set(fill(x, y), (y * W + x) * 4);
    return data;
  };

  it('segments a dark subject from a plain light ground', () => {
    const mask = segmentSilhouette(picture((x, y) => (x >= 60 && x < 140 && y >= 40 && y < 260 ? [30, 30, 40, 255] : [235, 235, 235, 255])), W, H);
    let area = 0;
    for (const v of mask.data) area += v;
    expect(area).toBe(80 * 220);
  });

  it('uses the alpha channel of a cut-out', () => {
    const mask = segmentSilhouette(picture((x) => (x < 100 ? [255, 255, 255, 255] : [255, 255, 255, 0])), W, H);
    expect(mask.data[10]).toBe(1);
    expect(mask.data[150]).toBe(0);
  });

  it('fits a picture to a known height, so the model of that height scores 1', () => {
    const subject = maskOf(figure(1));
    const fitted = fitReferenceView(subject, 'front', 2.6)!;
    expect(fitted.scale).toBeCloseTo(100, 0);
    const cam = referenceCamera(fitted, W);
    const model = rasterizeMask(figure(1), cam, W, H);
    expect(silhouetteIou(subject, model)).toBeGreaterThan(0.97);
  });

  it('cannot fit an empty picture', () => {
    expect(fitReferenceView({ width: 4, height: 4, data: new Uint8Array(16) }, 'front', 1)).toBeNull();
  });
});

describe('the pass planner', () => {
  it('walks block-in, convert, region and refine', () => {
    const stages = [[], [0.5], [0.5, 0.6], [0.5, 0.6, 0.75], [0.5, 0.6, 0.75, 0.92]].map((h) => {
      const plan = planReferencePass(h, 9);
      return plan.done ? 'done' : plan.stage;
    });
    expect(stages).toEqual(['block-in', 'block-in', 'convert', 'region', 'refine']);
  });

  it('stops at the target', () => {
    expect(planReferencePass([0.5, 0.97], 9)).toMatchObject({ done: true, reason: 'target' });
  });

  it('stops on a plateau', () => {
    const plan = planReferencePass([0.5, 0.8, 0.805, 0.806], 9);
    expect(plan).toMatchObject({ done: true, reason: 'plateau' });
  });

  it('does not call a still-improving run a plateau', () => {
    expect(planReferencePass([0.5, 0.7, 0.8, 0.86], 9).done).toBe(false);
  });

  it('stops when the budget is spent', () => {
    expect(planReferencePass([0.5, 0.6, 0.7], 2)).toMatchObject({ done: true, reason: 'budget' });
  });

  it('counts the passes left', () => {
    expect(planReferencePass([0.5, 0.6], 5)).toMatchObject({ done: false, pass: 2, remaining: 4 });
  });
});
