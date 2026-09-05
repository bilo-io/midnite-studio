import { app } from 'electron';
import { z } from 'zod';

import type { GpuStats } from '@midnite/studio-shared';

import { createGpuProbe, type GpuProbe } from '../metrics/gpu';

/**
 * GPU stats for the Optimizer's GPU tab (Phase 59 Theme E) — combining TWO
 * sources, because neither alone answers the whole question. `app.getGPUInfo`
 * gives a model name and (where Chromium reports it) VRAM, but never a load
 * percentage; the existing `metrics/gpu.ts` probe gives load, but never a
 * model or VRAM figure. Re-implementing the load side here was rejected —
 * see the phase doc's own correction of the first draft, which attributed
 * all three to one call.
 *
 * No temperature field anywhere — settled in code since Phase 18
 * (`metrics/gpu.ts`'s own docblock).
 */

const GpuDeviceSchema = z
  .object({
    active: z.boolean().optional(),
    vendorString: z.string().optional(),
    deviceString: z.string().optional(),
  })
  .partial();

/**
 * Chromium's `GPUInfo` shape is undocumented and platform-dependent —
 * `getGPUInfo` returns `Promise<unknown>` in Electron's own types for exactly
 * that reason. Every field here is optional; a shape this parse cannot match
 * degrades to `{model: null, vramBytes: null}` rather than reading through an
 * `any`.
 */
const GpuAuxAttributesSchema = z
  .object({
    glRenderer: z.string().optional(),
    videoMemoryMb: z.number().optional(),
    vramTotalMb: z.number().optional(),
  })
  .partial();

const GpuInfoSchema = z
  .object({
    gpuDevice: z.array(GpuDeviceSchema).optional(),
    auxAttributes: GpuAuxAttributesSchema.optional(),
  })
  .partial();

type GpuInfo = z.infer<typeof GpuInfoSchema>;

function deriveModel(info: GpuInfo): string | null {
  const device = info.gpuDevice?.find((candidate) => candidate.active === true) ?? info.gpuDevice?.[0];
  return device?.deviceString ?? info.auxAttributes?.glRenderer ?? null;
}

function deriveVramBytes(info: GpuInfo): number | null {
  const mb = info.auxAttributes?.videoMemoryMb ?? info.auxAttributes?.vramTotalMb;
  return typeof mb === 'number' && Number.isFinite(mb) ? Math.round(mb * 1024 * 1024) : null;
}

async function readModelAndVram(
  getGpuInfo: (infoType: 'complete') => Promise<unknown>,
): Promise<{ model: string | null; vramBytes: number | null }> {
  let raw: unknown;
  try {
    raw = await getGpuInfo('complete');
  } catch {
    return { model: null, vramBytes: null };
  }

  const parsed = GpuInfoSchema.safeParse(raw);
  if (!parsed.success) return { model: null, vramBytes: null };
  return { model: deriveModel(parsed.data), vramBytes: deriveVramBytes(parsed.data) };
}

/**
 * A single process-wide instance, like `metrics-service.ts`'s own. The probe
 * already self-disables after three consecutive failures and takes an
 * injected `platform`, so this file adds no fallback logic of its own — it
 * would only duplicate what `createGpuProbe` already does.
 */
const gpuProbe: GpuProbe = createGpuProbe();

export async function getGpuStats(
  getGpuInfo: (infoType: 'complete') => Promise<unknown> = (infoType) => app.getGPUInfo(infoType),
  probe: GpuProbe = gpuProbe,
): Promise<GpuStats> {
  const [{ model, vramBytes }, loadPercent] = await Promise.all([
    readModelAndVram(getGpuInfo),
    probe.sample(),
  ]);
  return { model, vramBytes, loadPercent: loadPercent ?? null };
}
