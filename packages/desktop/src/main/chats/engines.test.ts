import type { AgentDefinition } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { agyParser, buildInvocation, claudeContextWindow, claudeParser, codexParser, plainParser, type ParsedEvent } from './engines';

const agent = (id: string, extra: Partial<AgentDefinition> = {}): AgentDefinition => ({
  id,
  label: id,
  command: id,
  args: [],
  accent: '#fff',
  ...extra,
});

function run(parser: ReturnType<typeof claudeParser>, lines: string[], chunkSize = 0): ParsedEvent[] {
  const text = lines.join('\n') + '\n';
  const events: ParsedEvent[] = [];
  if (chunkSize === 0) events.push(...parser.push(text));
  else for (let i = 0; i < text.length; i += chunkSize) events.push(...parser.push(text.slice(i, i + chunkSize)));
  events.push(...parser.finish());
  return events;
}

// Lines captured from a real `claude -p --output-format stream-json --verbose --include-partial-messages` run.
const CLAUDE_LINES = [
  '{"type":"system","subtype":"hook_started","hook_id":"x","session_id":"64f8"}',
  '{"type":"system","subtype":"init","cwd":"/tmp/x","session_id":"64f8f6e5","tools":["Bash"]}',
  '{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"thinking"}},"session_id":"64f8f6e5"}',
  '{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}},"session_id":"64f8f6e5"}',
  '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hey"}},"session_id":"64f8f6e5"}',
  '{"type":"stream_event","event":{"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":", what\'s up?"}},"session_id":"64f8f6e5"}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Edit","input":{"file_path":"/tmp/x/a.ts"}}]}}',
  '{"type":"result","subtype":"success","is_error":false,"result":"Hey, what\'s up?","session_id":"64f8f6e5"}',
];

describe('claudeParser', () => {
  it('streams text deltas, reports the session and tool activity', () => {
    const events = run(claudeParser(), CLAUDE_LINES);
    expect(events.filter((e) => e.type === 'delta')).toEqual([
      { type: 'delta', text: 'Hey' },
      { type: 'delta', text: ", what's up?" },
    ]);
    expect(events).toContainEqual({ type: 'session', id: '64f8f6e5' });
    expect(events).toContainEqual({ type: 'activity', line: 'Edit /tmp/x/a.ts' });
    // Text already streamed, so the result carries no duplicate copy.
    expect(events[events.length - 1]).toEqual({ type: 'result' });
  });

  it('streams thinking deltas as thinking, never as reply text', () => {
    const events = run(claudeParser(), CLAUDE_LINES);
    expect(events.filter((e) => e.type === 'thinking')).toEqual([{ type: 'thinking', text: 'hmm' }]);
  });

  it('is indifferent to where the chunk boundaries fall', () => {
    const whole = run(claudeParser(), CLAUDE_LINES);
    for (const size of [1, 7, 53]) expect(run(claudeParser(), CLAUDE_LINES, size)).toEqual(whole);
  });

  it('falls back to the result text when nothing streamed', () => {
    const events = run(claudeParser(), ['{"type":"result","subtype":"success","is_error":false,"result":"whole answer","session_id":"s"}']);
    expect(events).toContainEqual({ type: 'result', text: 'whole answer' });
  });

  it('surfaces an error result', () => {
    const events = run(claudeParser(), ['{"type":"result","subtype":"error_during_execution","is_error":true,"result":"No conversation found"}']);
    expect(events).toContainEqual({ type: 'result', error: 'No conversation found' });
  });

  it('skips lines that are not JSON and unknown event shapes', () => {
    expect(run(claudeParser(), ['warning: something', '{"type":"brand_new_event","x":1}', '[1,2]'])).toEqual([]);
  });
});

// Usage-bearing lines in the shape `claude -p --output-format stream-json --verbose
// --include-partial-messages` emits: two API calls (a tool round-trip), then the result.
const CLAUDE_USAGE_LINES = [
  '{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-opus-5-5","usage":{"input_tokens":4,"cache_creation_input_tokens":1200,"cache_read_input_tokens":18000,"output_tokens":1}}}}',
  '{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":90}}}',
  '{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-opus-5-5","usage":{"input_tokens":2,"cache_creation_input_tokens":300,"cache_read_input_tokens":19200,"output_tokens":1}}}}',
  '{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":40}}}',
  '{"type":"result","subtype":"success","is_error":false,"result":"ok","session_id":"s","usage":{"input_tokens":6,"output_tokens":131},"modelUsage":{"claude-opus-5-5":{"inputTokens":6,"outputTokens":131,"contextWindow":1000000}}}',
];

describe('claudeParser usage', () => {
  const usages = () =>
    run(claudeParser(), CLAUDE_USAGE_LINES).flatMap((e) => (e.type === 'usage' ? [e.usage] : []));

  it('tracks output across calls and the context of the latest call', () => {
    const all = usages();
    expect(all[0]).toEqual({ outputTokens: 1, contextTokens: 19_205, contextWindow: 200_000 });
    expect(all[1]).toEqual({ outputTokens: 90, contextTokens: 19_294, contextWindow: 200_000 });
    expect(all[3]).toEqual({ outputTokens: 130, contextTokens: 19_542, contextWindow: 200_000 });
  });

  it('takes the result total as authoritative and a reported window over the model-id guess', () => {
    expect(usages().at(-1)).toEqual({ outputTokens: 131, contextTokens: 19_542, contextWindow: 1_000_000 });
  });

  it('guesses the window from the model id, long-context variant included', () => {
    expect(claudeContextWindow('claude-sonnet-5')).toBe(200_000);
    expect(claudeContextWindow('claude-opus-5-5[1m]')).toBe(1_000_000);
    expect(claudeContextWindow(undefined)).toBeUndefined();
  });
});

describe('codexParser', () => {
  const lines = [
    '{"type":"thread.started","thread_id":"0199-abc"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking"}}',
    '{"type":"item.completed","item":{"id":"item_1","type":"command_execution","command":"ls -la","status":"completed"}}',
    '{"type":"item.completed","item":{"id":"item_2","type":"file_change","changes":[{"path":"a.ts","kind":"update"},{"path":"b.ts","kind":"add"}]}}',
    '{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"First."}}',
    '{"type":"item.completed","item":{"id":"item_4","type":"agent_message","text":"Second."}}',
    '{"type":"turn.completed","usage":{}}',
  ];

  it('reads the thread id, activity and whole agent messages, separated by a blank line', () => {
    const events = run(codexParser(), lines);
    expect(events).toContainEqual({ type: 'session', id: '0199-abc' });
    expect(events).toContainEqual({ type: 'activity', line: 'Ran ls -la' });
    expect(events).toContainEqual({ type: 'activity', line: 'Changed a.ts, b.ts' });
    expect(events.filter((e) => e.type === 'delta')).toEqual([
      { type: 'delta', text: 'First.' },
      { type: 'delta', text: '\n\nSecond.' },
    ]);
  });

  it('reads reasoning items as thinking and the turn usage as generated tokens', () => {
    const events = run(codexParser(), [
      '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"**Planning** the change"}}',
      '{"type":"item.completed","item":{"id":"item_1","type":"reasoning","text":"Checking tests"}}',
      '{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"output_tokens":122}}',
    ]);
    expect(events).toEqual([
      { type: 'thinking', text: '**Planning** the change' },
      { type: 'thinking', text: '\n\nChecking tests' },
      { type: 'usage', usage: { outputTokens: 122 } },
    ]);
  });

  it('reports a failed turn', () => {
    expect(run(codexParser(), ['{"type":"turn.failed","error":{"message":"rate limited"}}'])).toEqual([
      { type: 'result', error: 'rate limited' },
    ]);
  });
});

// Captured from a real `agy --output-format stream-json -p …` run.
describe('agyParser', () => {
  const lines = [
    '{"event":"init","conversation_id":"b812","init":{"cwd":"/tmp"}}',
    '{"event":"step_update","step_update":{"step_index":0,"state":"DONE","step_type":"user_input"}}',
    '{"event":"step_update","step_update":{"step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"Hello there, friend!"}}',
    '{"event":"step_update","step_update":{"step_index":1,"state":"DONE","step_type":"agent_response","text_delta":"\\n"}}',
    '{"event":"result","result":{"conversation_id":"b812","status":"SUCCESS","response":"Hello there, friend!\\n"}}',
  ];

  it('reads the conversation id and the text deltas, dropping the trailing blank one', () => {
    const events = run(agyParser(), lines);
    expect(events).toContainEqual({ type: 'session', id: 'b812' });
    expect(events.filter((e) => e.type === 'delta')).toEqual([{ type: 'delta', text: 'Hello there, friend!' }]);
    expect(events[events.length - 1]).toEqual({ type: 'result' });
  });

  it('turns a non-success result into an error', () => {
    const events = run(agyParser(), ['{"event":"result","result":{"status":"FAILED","response":"boom"}}']);
    expect(events).toContainEqual({ type: 'result', error: 'boom' });
  });
});

describe('plainParser', () => {
  it('passes stdout through as the reply', () => {
    const parser = plainParser();
    expect(parser.push('hello ')).toEqual([{ type: 'delta', text: 'hello ' }]);
    expect(parser.push('')).toEqual([]);
  });
});

describe('buildInvocation', () => {
  it('claude: stream-json, permission mode per chat mode, resume and model when given', () => {
    const edit = buildInvocation({ agent: agent('claude'), prompt: 'hi', mode: 'edit', model: null, sessionId: null })!;
    expect(edit.args).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--permission-mode',
      'acceptEdits',
      'hi',
    ]);
    expect(edit.resumed).toBe(false);

    const ask = buildInvocation({ agent: agent('claude'), prompt: 'hi', mode: 'ask', model: 'opus-5-5', sessionId: 'sess-1' })!;
    expect(ask.args).toContain('plan');
    expect(ask.args).toEqual(expect.arrayContaining(['--model', 'claude-opus-5-5', '--resume', 'sess-1']));
    expect(ask.args[ask.args.length - 1]).toBe('hi');
    expect(ask.resumed).toBe(true);
  });

  it('codex: exec --json with a sandbox, and `exec resume <id>` to continue', () => {
    const fresh = buildInvocation({ agent: agent('codex'), prompt: 'go', mode: 'edit', model: null, sessionId: null })!;
    expect(fresh.args).toEqual(['exec', '--json', '--skip-git-repo-check', '-s', 'workspace-write', 'go']);
    const resumed = buildInvocation({ agent: agent('codex'), prompt: 'go', mode: 'ask', model: null, sessionId: 't-9' })!;
    expect(resumed.args).toEqual(['exec', 'resume', '--json', '--skip-git-repo-check', '-s', 'read-only', 't-9', 'go']);
  });

  it('agy: stream-json, --mode, --conversation, prompt after -p', () => {
    const edit = buildInvocation({ agent: agent('agy'), prompt: 'go', mode: 'edit', model: null, sessionId: 'c-1' })!;
    expect(edit.args).toEqual(['--output-format', 'stream-json', '--mode', 'accept-edits', '--conversation', 'c-1', '-p', 'go']);
    const ask = buildInvocation({ agent: agent('agy'), prompt: 'go', mode: 'ask', model: null, sessionId: null })!;
    expect(ask.args).toEqual(['--output-format', 'stream-json', '--mode', 'plan', '-p', 'go']);
  });

  it('uses the generic print-mode driver for other roster agents, with no resume', () => {
    const cursor = buildInvocation({ agent: agent('cursor'), prompt: 'go', mode: 'ask', model: null, sessionId: 'ignored' })!;
    expect(cursor.args).toEqual(['-p', 'go']);
    expect(cursor.resumed).toBe(false);
  });

  it('refuses an agent with no print mode', () => {
    expect(buildInvocation({ agent: agent('mystery'), prompt: 'go', mode: 'ask', model: null, sessionId: null })).toBeNull();
  });

  it('never lets a prompt that starts with a dash be read as an option', () => {
    const inv = buildInvocation({ agent: agent('claude'), prompt: '--help me', mode: 'ask', model: null, sessionId: null })!;
    expect(inv.args[inv.args.length - 1]).toBe(' --help me');
  });

  it("keeps the roster's own leading args", () => {
    const inv = buildInvocation({ agent: agent('claude', { args: ['--foo'] }), prompt: 'x', mode: 'ask', model: null, sessionId: null })!;
    expect(inv.args[0]).toBe('--foo');
  });
});
