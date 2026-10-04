import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';

import {
  consentIsCurrent,
  MODEL_IMAGE_MAX_BYTES,
  SF3D_DOWNLOAD_BYTES,
  SF3D_LICENCE_NAME,
  SF3D_LICENCE_URL,
  SF3D_REVENUE_LIMIT_USD,
  type GitOpResult,
  type McpToolInput,
  type McpToolOutput,
  type Sf3dProgressEvent,
  type Sf3dRequest,
  type Sf3dStatus,
} from '@midnite/studio-shared';

import { McpToolError } from '../../../mcp/errors';

/**
 * `model_sf3d_status` and `model_generate_sf3d` (Phase 103 Theme J) over the same dispatcher the
 * Models tab uses. An agent can *use* SF3D once the user has installed it, never install it: the
 * consent is the user's alone, so a not-ready SF3D answers a refusal naming what the user must do.
 * A generation is started and returned from at once — a CPU run outlasts the shim's call timeout —
 * and `model_sf3d_status({ generationId })` reports it until it names the `.glb`.
 */
export type Sf3dMcpDeps = {
  handle: (req: Sf3dRequest) => Promise<GitOpResult<unknown> | GitOpResult>;
  resolveRepo: (repoPath: string) => Promise<{ ok: true; repoId: string } | { ok: false; kind: 'not-found' | 'refused'; message: string }>;
  readFile: (path: string) => Promise<Buffer>;
  /** The latest event of a generation, by id. */
  generation: (generationId: string) => Extract<Sf3dProgressEvent, { kind: 'generate' }> | undefined;
  newId?: () => string;
};

const MIME: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

export const SF3D_NOT_READY_HINT =
  'Ask the user to open Media ▸ Models ▸ SF3D, read and accept the Stability AI Community License, and install SF3D (~1.7 GB) — an agent cannot accept the licence for them.';

export function createSf3dMcpTools(deps: Sf3dMcpDeps) {
  const newId = deps.newId ?? randomUUID;

  async function readStatus(): Promise<Sf3dStatus> {
    const result = await deps.handle({ op: 'status' });
    if (!result.ok) throw new McpToolError('error', result.kind === 'error' ? result.message : 'SF3D could not report its status.');
    return (result as { ok: true; value: Sf3dStatus }).value;
  }

  async function model_sf3d_status(input: McpToolInput<'model_sf3d_status'>): Promise<McpToolOutput<'model_sf3d_status'>> {
    const status = await readStatus();
    const installed = status.state === 'installed';
    const consentCurrent = consentIsCurrent(status.consent);
    const event = input.generationId ? deps.generation(input.generationId) : undefined;
    if (input.generationId && !event) throw new McpToolError('not-found', `No SF3D run "${input.generationId}" in this session.`);
    return {
      state: status.state,
      installed,
      consentCurrent,
      licence: { name: SF3D_LICENCE_NAME, url: SF3D_LICENCE_URL, revenueLimitUsd: SF3D_REVENUE_LIMIT_USD },
      downloadBytes: SF3D_DOWNLOAD_BYTES,
      bytesOnDisk: status.bytesOnDisk,
      ...(installed && consentCurrent ? {} : { hint: status.state === 'unavailable' ? (status.reason ?? 'SF3D cannot run in this build.') : SF3D_NOT_READY_HINT }),
      ...(event
        ? {
            generation: {
              generationId: event.generationId,
              project: event.project,
              status: event.status,
              ...(event.stage ? { stage: event.stage } : {}),
              ...(event.fraction !== undefined ? { fraction: event.fraction } : {}),
              ...(event.error ? { error: event.error } : {}),
              ...(event.primary ? { primary: event.primary } : {}),
            },
          }
        : {}),
    };
  }

  async function model_generate_sf3d(input: McpToolInput<'model_generate_sf3d'>): Promise<McpToolOutput<'model_generate_sf3d'>> {
    const repo = await deps.resolveRepo(input.repoPath);
    if (!repo.ok) throw new McpToolError(repo.kind, repo.message);
    const status = await readStatus();
    if (status.state === 'unavailable') throw new McpToolError('refused', status.reason ?? 'SF3D cannot run in this build.');
    if (status.state !== 'installed' || !consentIsCurrent(status.consent)) throw new McpToolError('refused', `SF3D is not installed. ${SF3D_NOT_READY_HINT}`);

    const root = resolve(input.repoPath);
    const file = isAbsolute(input.imagePath) ? resolve(input.imagePath) : resolve(root, input.imagePath);
    const inside = relative(root, file);
    if (inside.startsWith('..') || isAbsolute(inside)) throw new McpToolError('refused', 'imagePath must be inside the repository.');
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME[ext];
    if (!mime) throw new McpToolError('error', 'imagePath must be a .png, .jpg, .webp or .gif picture.');
    let data: Buffer;
    try {
      data = await deps.readFile(file);
    } catch {
      throw new McpToolError('not-found', `No picture at ${inside}.`);
    }
    if (data.length > MODEL_IMAGE_MAX_BYTES) throw new McpToolError('error', `The picture is over ${MODEL_IMAGE_MAX_BYTES / 1024 / 1024} MB.`);

    const generationId = `sf3d-${newId()}`;
    const name = file.split('/').pop() ?? 'picture';
    // Started, not awaited: progress lands in `generation(id)` through the service's events.
    void deps.handle({
      op: 'generate',
      generationId,
      repoId: repo.repoId,
      project: input.project,
      image: { name, mime, data: data.toString('base64') },
      ...(input.name ? { name: input.name } : {}),
      ...(input.textureSize ? { textureSize: input.textureSize } : {}),
    });
    return { started: true, generationId };
  }

  return { model_sf3d_status, model_generate_sf3d };
}

export type Sf3dMcpTools = ReturnType<typeof createSf3dMcpTools>;
