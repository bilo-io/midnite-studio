import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

import { BUILTIN_AGENTS, type AgentDefinition } from '@midnite/studio-shared';

import { guardedFetchFor } from '../net/guarded-fetch';
import { OUTPUT_TAIL_CAP, runProcess, type SpawnFn } from '../process-runner';
import type { HeadlessProcessResult, HeadlessTextPorts } from './headless-text';

/**
 * The ports `runHeadlessText` needs, built from Node alone (Phase 153 Theme D), for a suite app that has no roster
 * service or Ollama client of its own. Three small pieces: a probe of the agent CLIs on `PATH`, a process runner
 * that collects stdout, and a direct HTTP call to a local Ollama. Everything environmental is injectable, so a test
 * spawns nothing and opens no socket.
 */

/** The CLIs a suite app offers for drafting: the roster's headless-capable ones. */
export const HEADLESS_PROBE_IDS: readonly string[] = ['claude', 'codex', 'agy'];

export const OLLAMA_BASE_URL = 'http://localhost:11434';

export type HeadlessPortsDeps = {
  env?: NodeJS.ProcessEnv;
  /** Whether `path` is an executable file; defaults to `fs.accessSync(X_OK)`. */
  isExecutable?: (path: string) => boolean;
  spawn?: SpawnFn;
  fetch?: typeof fetch;
  ollamaBaseUrl?: string;
};

function executableOnDisk(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The roster entries whose command is found on `PATH`, in the probe's order. Never spawns. */
export function probeAgents(deps: Pick<HeadlessPortsDeps, 'env' | 'isExecutable'> = {}): AgentDefinition[] {
  const dirs = (deps.env ?? process.env)['PATH']?.split(delimiter).filter((d) => d !== '') ?? [];
  const isExecutable = deps.isExecutable ?? executableOnDisk;
  const found: AgentDefinition[] = [];
  for (const id of HEADLESS_PROBE_IDS) {
    const agent = BUILTIN_AGENTS.find((a) => a.id === id);
    if (agent && dirs.some((dir) => isExecutable(join(dir, agent.command)))) found.push(agent);
  }
  return found;
}

/** One `/api/chat` call, non-streaming; failures are sentences, never throws. */
export async function runOllamaHttp(
  model: string,
  prompt: string,
  timeoutMs: number,
  deps: Pick<HeadlessPortsDeps, 'fetch' | 'ollamaBaseUrl'> = {},
): Promise<{ ok: true; data: string } | { ok: false; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // `models` owns the configured-Ollama egress entry; the seam is what lets Settings ▸ Privacy list this call.
    const response = await (deps.fetch ?? guardedFetchFor('models'))(`${deps.ollamaBaseUrl ?? OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: prompt }] }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, message: `Ollama answered ${response.status} for ${model}.` };
    const body = (await response.json()) as { message?: { content?: unknown } };
    const content = body.message?.content;
    return typeof content === 'string' ? { ok: true, data: content } : { ok: false, message: `Ollama sent no text for ${model}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: /abort|timed? ?out/i.test(message) ? 'That took too long, so the request was cancelled.' : `Could not reach Ollama (${model}): ${message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Collects stdout (tail-capped) as the reply. */
async function runCapturing(
  command: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number },
  spawn: SpawnFn | undefined,
): Promise<HeadlessProcessResult> {
  let buffer = '';
  const outcome = await runProcess<string>(command, args, opts.cwd ?? '', {
    timeoutMs: opts.timeoutMs,
    sink: {
      push: (chunk) => {
        buffer = (buffer + chunk).slice(-OUTPUT_TAIL_CAP);
      },
      finish: () => ({ ok: true, data: buffer }),
    },
    ...(spawn ? { spawn } : {}),
  });
  return outcome.ok ? { ok: true, stdout: outcome.data } : { ok: false, message: outcome.hint, timedOut: outcome.reason === 'timed-out' };
}

export function createHeadlessTextPorts(deps: HeadlessPortsDeps = {}): HeadlessTextPorts {
  return {
    listAgents: async () => probeAgents(deps),
    runProcess: (command, args, opts) => runCapturing(command, args, opts, deps.spawn),
    runOllama: (model, prompt, timeoutMs) => runOllamaHttp(model, prompt, timeoutMs, deps),
  };
}
