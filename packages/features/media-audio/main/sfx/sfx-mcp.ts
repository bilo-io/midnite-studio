import { randomUUID } from 'node:crypto';

import {
  MEDIA_ROOT_DIR,
  SFX_ATTRIBUTION,
  SFX_DOWNLOAD_BYTES,
  SFX_LICENCE_NAME,
  SFX_LICENCE_URL,
  SFX_NOT_READY_HINT,
  SFX_REVENUE_LIMIT_USD,
  sfxConsentIsCurrent,
  type GitOpResult,
  type McpToolInput,
  type McpToolOutput,
  type SfxProgressEvent,
  type SfxRequest,
  type SfxStatus,
} from '@midnite/studio-shared';

import { McpToolError } from '@midnite/studio-runtime';

/**
 * `sfx_status` and `sfx_generate` over the same dispatcher Media ▸ SFX uses. An agent can *use* Stable Audio
 * Open Small once the user has installed it, never install it: a not-ready model answers a refusal naming
 * what the user must do. A generation is started and returned from at once, and `sfx_status({ generationId })`
 * reports it until it lists the `.wav` files.
 */
export type SfxMcpDeps = {
  handle: (req: SfxRequest) => Promise<GitOpResult<unknown> | GitOpResult>;
  resolveRepo: (repoPath: string) => Promise<{ ok: true; repoId: string } | { ok: false; kind: 'not-found' | 'refused'; message: string }>;
  /** The latest event of a generation, by id. */
  generation: (generationId: string) => Extract<SfxProgressEvent, { kind: 'generate' }> | undefined;
  newId?: () => string;
};

export function createSfxMcpTools(deps: SfxMcpDeps) {
  const newId = deps.newId ?? randomUUID;

  async function readStatus(): Promise<SfxStatus> {
    const result = await deps.handle({ op: 'status' });
    if (!result.ok) throw new McpToolError('error', result.kind === 'error' ? result.message : 'Stable Audio Open Small could not report its status.');
    return (result as { ok: true; value: SfxStatus }).value;
  }

  const notReady = (status: SfxStatus) => (status.state === 'unavailable' ? (status.reason ?? 'Stable Audio Open Small cannot run in this app.') : SFX_NOT_READY_HINT);

  async function sfx_status(input: McpToolInput<'sfx_status'>): Promise<McpToolOutput<'sfx_status'>> {
    const status = await readStatus();
    const installed = status.state === 'installed';
    const consentCurrent = sfxConsentIsCurrent(status.consent);
    const event = input.generationId ? deps.generation(input.generationId) : undefined;
    if (input.generationId && !event) throw new McpToolError('not-found', `No SFX run "${input.generationId}" in this session.`);
    return {
      state: status.state,
      installed,
      consentCurrent,
      licence: { name: SFX_LICENCE_NAME, url: SFX_LICENCE_URL, revenueLimitUsd: SFX_REVENUE_LIMIT_USD, attribution: SFX_ATTRIBUTION },
      downloadBytes: SFX_DOWNLOAD_BYTES,
      bytesOnDisk: status.bytesOnDisk,
      ...(installed && consentCurrent ? {} : { hint: notReady(status) }),
      ...(event
        ? {
            generation: {
              generationId: event.generationId,
              project: event.project,
              status: event.status,
              ...(event.stage ? { stage: event.stage } : {}),
              ...(event.fraction !== undefined ? { fraction: event.fraction } : {}),
              ...(event.error ? { error: event.error } : {}),
              ...(event.files?.length ? { files: event.files.map((file) => `${MEDIA_ROOT_DIR}/sfx/${event.project}/${file}`) } : {}),
            },
          }
        : {}),
    };
  }

  async function sfx_generate(input: McpToolInput<'sfx_generate'>): Promise<McpToolOutput<'sfx_generate'>> {
    const repo = await deps.resolveRepo(input.repoPath);
    if (!repo.ok) throw new McpToolError(repo.kind, repo.message);
    const status = await readStatus();
    if (status.state === 'unavailable') throw new McpToolError('refused', notReady(status));
    if (status.state !== 'installed' || !sfxConsentIsCurrent(status.consent)) {
      throw new McpToolError('refused', `Stable Audio Open Small is not installed. ${SFX_NOT_READY_HINT}`);
    }
    const generationId = `sfx-${newId()}`;
    // Started, not awaited: progress lands in `generation(id)` through the service's events.
    void deps.handle({
      op: 'generate',
      generationId,
      repoId: repo.repoId,
      project: input.project,
      prompt: input.prompt,
      ...(input.name ? { name: input.name } : {}),
      ...(input.options ? { options: input.options } : {}),
    });
    return { started: true, generationId };
  }

  return { sfx_status, sfx_generate };
}

export type SfxMcpTools = ReturnType<typeof createSfxMcpTools>;
