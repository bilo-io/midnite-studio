import { agentHeadlessArgs, loopModelArgs, type AgentDefinition, type ChatMode, type LoopModel } from '@midnite/studio-shared';

/**
 * How each agent CLI is driven for a chat turn, and how its streamed output is
 * read back.
 *
 * Three CLIs get a purpose-built driver because each offers a structured,
 * incremental output format and its own session resume:
 *
 * - **Claude Code** — `-p --output-format stream-json --verbose
 *   --include-partial-messages`: `content_block_delta` events carry the text,
 *   `init`/`result` carry the `session_id`, and `--resume <id>` continues the
 *   conversation. `--permission-mode acceptEdits` lets it edit files in its
 *   sandbox without a prompt nobody could answer (`plan` for a read-only ask).
 * - **Codex** — `codex exec --json`: JSONL of `thread.started` (the resume id),
 *   `item.*` (messages, commands, file changes) and `turn.*`;
 *   `codex exec resume <id>` continues it; `-s workspace-write|read-only`.
 * - **Antigravity (`agy`)** — `--output-format stream-json`: an `init` event
 *   with `conversation_id`, `step_update`s whose `text_delta` is the reply, a
 *   final `result`; `--conversation <id>` resumes; `--mode plan` is read-only.
 *
 * Every other roster agent with a print mode runs through the generic driver:
 * plain stdout as the reply, no resume — the service replays the transcript.
 * Parsers are lenient on purpose: a line that is not JSON, or an event shape we
 * do not know, is skipped, never thrown — a CLI that adds an event type must not
 * break chats.
 */

export type ParsedEvent =
  | { type: 'delta'; text: string }
  | { type: 'activity'; line: string }
  | { type: 'session'; id: string }
  /** The CLI's own final answer, used when no delta was streamed. */
  | { type: 'result'; text?: string; error?: string };

export type StreamParser = {
  push: (chunk: string) => ParsedEvent[];
  finish: () => ParsedEvent[];
};

export type Invocation = {
  /** Everything after the command, prompt included. */
  args: string[];
  parser: StreamParser;
  /** Whether `session` was used to resume (false: the service replays the transcript). */
  resumed: boolean;
};

export type InvocationInput = {
  agent: AgentDefinition;
  prompt: string;
  mode: ChatMode;
  /** A `LOOP_MODELS` id for claude; ignored by drivers that have no model flag. */
  model: string | null;
  /** The engine's own session id, when it can resume. */
  sessionId: string | null;
};

/** A prompt beginning with `-` would be read as an option; a leading space is a positional. */
const positional = (prompt: string): string => (prompt.startsWith('-') ? ` ${prompt}` : prompt);

/** Splits a stream into complete lines, carrying a partial line to the next chunk. */
function lineBuffer(onLine: (line: string) => ParsedEvent[]): StreamParser {
  let carry = '';
  return {
    push: (chunk) => {
      carry += chunk;
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      return lines.flatMap((line) => (line.trim() === '' ? [] : onLine(line)));
    },
    finish: () => {
      const rest = carry.trim();
      carry = '';
      return rest === '' ? [] : onLine(rest);
    },
  };
}

function json(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const rec = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const clip = (text: string, max = 90): string => {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

// --- Claude Code ---------------------------------------------------------------

/** "Edit src/a.ts" — what a tool call is doing, in a chip's worth of text. */
function claudeToolLine(name: string, input: Record<string, unknown> | undefined): string {
  const target = str(input?.file_path) ?? str(input?.path) ?? str(input?.command) ?? str(input?.pattern) ?? str(input?.url);
  return target ? `${name} ${clip(target, 70)}` : name;
}

export function claudeParser(): StreamParser {
  let sawDelta = false;
  return lineBuffer((line) => {
    const event = json(line);
    if (!event) return [];
    const out: ParsedEvent[] = [];
    const sessionId = str(event.session_id);
    switch (event.type) {
      case 'system':
        if (event.subtype === 'init' && sessionId) out.push({ type: 'session', id: sessionId });
        break;
      case 'stream_event': {
        const inner = rec(event.event);
        const delta = rec(inner?.delta);
        if (inner?.type === 'content_block_delta' && delta?.type === 'text_delta') {
          const text = str(delta.text);
          if (text) {
            sawDelta = true;
            out.push({ type: 'delta', text });
          }
        }
        break;
      }
      case 'assistant': {
        // Whole messages carry the tool calls (partial deltas carry only text).
        const content = rec(event.message)?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = rec(block);
            if (b?.type === 'tool_use') {
              const name = str(b.name);
              if (name) out.push({ type: 'activity', line: claudeToolLine(name, rec(b.input)) });
            }
          }
        }
        break;
      }
      case 'result': {
        if (sessionId) out.push({ type: 'session', id: sessionId });
        const isError = event.is_error === true || (typeof event.subtype === 'string' && event.subtype.startsWith('error'));
        const result = str(event.result);
        if (isError) out.push({ type: 'result', error: result ?? 'The agent reported an error.' });
        else out.push(sawDelta || !result ? { type: 'result' } : { type: 'result', text: result });
        break;
      }
      default:
        break;
    }
    return out;
  });
}

// --- Codex ---------------------------------------------------------------------

export function codexParser(): StreamParser {
  let messages = 0;
  return lineBuffer((line) => {
    const event = json(line);
    if (!event) return [];
    const out: ParsedEvent[] = [];
    switch (event.type) {
      case 'thread.started': {
        const id = str(event.thread_id);
        if (id) out.push({ type: 'session', id });
        break;
      }
      case 'item.completed': {
        const item = rec(event.item);
        const kind = str(item?.type);
        if (kind === 'agent_message') {
          const text = str(item?.text);
          if (text) {
            out.push({ type: 'delta', text: messages === 0 ? text : `\n\n${text}` });
            messages += 1;
          }
        } else if (kind === 'command_execution') {
          const command = str(item?.command);
          if (command) out.push({ type: 'activity', line: `Ran ${clip(command, 80)}` });
        } else if (kind === 'file_change') {
          const changes = item?.changes;
          if (Array.isArray(changes)) {
            const paths = changes.map((c) => str(rec(c)?.path)).filter((p): p is string => p !== undefined);
            if (paths.length > 0) out.push({ type: 'activity', line: `Changed ${clip(paths.join(', '), 80)}` });
          }
        } else if (kind === 'error') {
          const message = str(item?.message);
          if (message) out.push({ type: 'result', error: message });
        }
        break;
      }
      case 'turn.failed': {
        out.push({ type: 'result', error: str(rec(event.error)?.message) ?? 'The turn failed.' });
        break;
      }
      case 'error': {
        out.push({ type: 'result', error: str(event.message) ?? 'The agent reported an error.' });
        break;
      }
      default:
        break;
    }
    return out;
  });
}

// --- Antigravity (agy) -----------------------------------------------------------

export function agyParser(): StreamParser {
  let sawDelta = false;
  return lineBuffer((line) => {
    const event = json(line);
    if (!event) return [];
    const out: ParsedEvent[] = [];
    switch (event.event) {
      case 'init': {
        const id = str(event.conversation_id);
        if (id) out.push({ type: 'session', id });
        break;
      }
      case 'step_update': {
        const step = rec(event.step_update);
        if (step?.step_type === 'agent_response') {
          const text = str(step.text_delta);
          // The closing `DONE` update repeats nothing but a trailing newline; keep
          // only real text, so the message does not end with a stray blank line.
          if (text && text.trim().length > 0) {
            sawDelta = true;
            out.push({ type: 'delta', text });
          }
        } else if (step && step.state === 'DONE' && typeof step.step_type === 'string' && step.step_type !== 'user_input') {
          out.push({ type: 'activity', line: String(step.step_type).replace(/_/g, ' ') });
        }
        break;
      }
      case 'result': {
        const result = rec(event.result);
        const id = str(result?.conversation_id);
        if (id) out.push({ type: 'session', id });
        if (result?.status && result.status !== 'SUCCESS') {
          out.push({ type: 'result', error: str(result.response) ?? `The agent finished with ${String(result.status)}.` });
        } else {
          const text = str(result?.response);
          out.push(sawDelta || !text ? { type: 'result' } : { type: 'result', text });
        }
        break;
      }
      default:
        break;
    }
    return out;
  });
}

// --- generic -----------------------------------------------------------------------

/** Plain stdout is the reply. */
export function plainParser(): StreamParser {
  return {
    push: (chunk) => (chunk.length > 0 ? [{ type: 'delta', text: chunk }] : []),
    finish: () => [],
  };
}

/** Engines with their own resume. */
export const RESUMABLE_ENGINES: ReadonlySet<string> = new Set(['claude', 'codex', 'agy']);

/**
 * The command line for one turn. Returns `null` when the agent has no known
 * print mode (it cannot run unattended, so it cannot back a chat).
 */
export function buildInvocation(input: InvocationInput): Invocation | null {
  const { agent, mode, sessionId } = input;
  const prompt = positional(input.prompt);
  const base = agent.args ?? [];

  switch (agent.id) {
    case 'claude': {
      const modelArgs = input.model ? loopModelArgs('claude', input.model as LoopModel) : [];
      return {
        args: [
          ...base,
          '-p',
          '--output-format',
          'stream-json',
          '--verbose',
          '--include-partial-messages',
          '--permission-mode',
          mode === 'edit' ? 'acceptEdits' : 'plan',
          ...modelArgs,
          ...(sessionId ? ['--resume', sessionId] : []),
          prompt,
        ],
        parser: claudeParser(),
        resumed: sessionId !== null,
      };
    }
    case 'codex': {
      const sandbox = mode === 'edit' ? 'workspace-write' : 'read-only';
      return {
        args: [
          ...base,
          'exec',
          ...(sessionId ? ['resume'] : []),
          '--json',
          '--skip-git-repo-check',
          '-s',
          sandbox,
          ...(sessionId ? [sessionId] : []),
          prompt,
        ],
        parser: codexParser(),
        resumed: sessionId !== null,
      };
    }
    case 'agy': {
      return {
        args: [
          ...base,
          '--output-format',
          'stream-json',
          ...(mode === 'edit' ? ['--mode', 'accept-edits'] : ['--mode', 'plan']),
          ...(sessionId ? ['--conversation', sessionId] : []),
          '-p',
          prompt,
        ],
        parser: agyParser(),
        resumed: sessionId !== null,
      };
    }
    default: {
      const headless = agentHeadlessArgs(agent.id);
      if (!headless) return null;
      return { args: [...base, ...headless, prompt], parser: plainParser(), resumed: false };
    }
  }
}
