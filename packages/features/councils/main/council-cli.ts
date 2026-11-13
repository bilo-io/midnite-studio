import { modelsForAgent, type CouncilMemberProvider } from '@midnite/studio-shared';

/**
 * How each council provider's CLI is asked one question and how its answer is
 * read back (Phase 133 Theme A). Pure: no pty, no fs.
 *
 * agy and Claude answer in print mode with `--output-format json`, which hands
 * back the answer without the TUI's spinners and the session id a follow-up
 * turn resumes (verified against agy 1.5.8 and Claude Code on 2026-11-13):
 *
 * - agy: `{"conversation_id":"…","status":"SUCCESS","response":"…"}`, resumed with `--conversation <id>`.
 *   `-p` takes the prompt as its value, so it must be the last flag.
 * - claude: `{"type":"result","is_error":false,"result":"…","session_id":"…"}`, resumed with `--resume <id>`.
 *
 * Codex and OpenCode keep their plain print modes (`exec`, `run`): neither is
 * installed where this was written, so no structured flag is assumed for them,
 * and each turn starts a fresh session.
 */

export type CouncilCliRequest = {
  provider: CouncilMemberProvider;
  /** A `modelsForAgent` id, or absent for the CLI's default. */
  model?: string | undefined;
  /** The CLI session to resume, when the provider supports it. */
  sessionId?: string | undefined;
  /** `false` when an Ollama binding already chose the model (`resolveAgentLaunch` adds the flag). */
  allowModelFlag?: boolean;
};

/** Whether the provider's answer comes back as JSON with a resumable session. */
export function councilProviderIsStructured(provider: CouncilMemberProvider): boolean {
  return provider === 'agy' || provider === 'claude';
}

/** The CLI model word for a catalogue id, or `null` for the CLI's default (or an id the catalogue no longer has). */
export function councilCliModel(provider: CouncilMemberProvider, model: string | undefined): string | null {
  if (model === undefined || model === 'default') return null;
  const entry = modelsForAgent(provider).find((m) => m.id === model);
  if (!entry) return null;
  return entry.cliModel ?? null;
}

/**
 * The words between the command (and any launch `argsBefore`) and the prompt,
 * ending with the flag the prompt follows, if any.
 */
export function councilCliArgs(request: CouncilCliRequest): string[] {
  const cliModel = request.allowModelFlag === false ? null : councilCliModel(request.provider, request.model);
  const modelArgs = cliModel === null ? [] : ['--model', cliModel];
  switch (request.provider) {
    case 'agy':
      return [
        ...modelArgs,
        ...(request.sessionId ? ['--conversation', request.sessionId] : []),
        '--output-format',
        'json',
        '-p',
      ];
    case 'claude':
      return [...modelArgs, ...(request.sessionId ? ['--resume', request.sessionId] : []), '--output-format', 'json', '-p'];
    case 'codex':
      return ['exec', ...modelArgs];
    case 'opencode':
      return ['run', ...modelArgs];
  }
}

export type CouncilCliAnswer = {
  ok: boolean;
  text: string;
  sessionId?: string;
  error?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The last line of `text` that parses as a JSON object, or `null`. */
function lastJsonObject(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    const start = line.indexOf('{');
    if (start === -1) continue;
    try {
      const parsed = asRecord(JSON.parse(line.slice(start)));
      if (parsed) return parsed;
    } catch {
      // Not this line.
    }
  }
  return null;
}

/**
 * Read a CLI's settled output. `cleaned` is the capture with ANSI, redraws and
 * the echoed command already stripped. A structured provider whose output has
 * no JSON falls back to the text, so a CLI that changed its output still shows
 * something rather than nothing.
 */
export function parseCouncilAnswer(provider: CouncilMemberProvider, cleaned: string, exitCode: number): CouncilCliAnswer {
  if (councilProviderIsStructured(provider)) {
    const json = lastJsonObject(cleaned);
    if (json) {
      if (provider === 'agy') {
        const text = typeof json['response'] === 'string' ? json['response'].trim() : '';
        const sessionId = typeof json['conversation_id'] === 'string' && json['conversation_id'] ? json['conversation_id'] : undefined;
        const status = typeof json['status'] === 'string' ? json['status'] : 'SUCCESS';
        const ok = status === 'SUCCESS' && exitCode === 0;
        const message = typeof json['error'] === 'string' ? json['error'] : `Antigravity answered with status ${status}.`;
        return { ok, text, ...(sessionId ? { sessionId } : {}), ...(ok ? {} : { error: message }) };
      }
      const text = typeof json['result'] === 'string' ? json['result'].trim() : '';
      const sessionId = typeof json['session_id'] === 'string' && json['session_id'] ? json['session_id'] : undefined;
      const isError = json['is_error'] === true || exitCode !== 0;
      return {
        ok: !isError,
        text,
        ...(sessionId ? { sessionId } : {}),
        ...(isError ? { error: text.length > 0 ? text : `Claude exited with code ${exitCode}.` } : {}),
      };
    }
  }
  const text = cleaned.trim();
  if (exitCode !== 0) return { ok: false, text, error: `Exited with code ${exitCode}.` };
  if (text.length === 0) return { ok: false, text, error: 'The agent exited without an answer.' };
  return { ok: true, text };
}

/** One word for a POSIX shell script, newlines and all — unlike `shellQuote`, nothing is collapsed. */
export function scriptQuote(word: string): string {
  return `'${word.replace(/'/g, String.raw`'\''`)}'`;
}

/**
 * The script a member's shell runs: the CLI with the prompt read from a file
 * (`"$(cat …)"`), so the prompt never passes through the shell's line editor,
 * and stdin closed so a print mode never waits on the terminal.
 */
export function councilScript(words: readonly string[], promptFile: string): string {
  return ['#!/bin/sh', `exec ${words.map(scriptQuote).join(' ')} "$(cat ${scriptQuote(promptFile)})" < /dev/null`, ''].join('\n');
}
