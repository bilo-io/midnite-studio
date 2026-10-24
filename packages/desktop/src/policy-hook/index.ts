#!/usr/bin/env node
/**
 * Midnite Studio's CLI PreToolUse policy hook (Phase 121 Theme B).
 *
 * Runs under plain Node as a hook script configured in Claude Code (~/.claude/settings.json)
 * or Codex (~/.codex/hooks.json). Reads the tool call payload on stdin, delegates evaluation
 * to Midnite Studio's policy evaluator over the MCP socket ('policy.evaluate'), and exits:
 *   - Exit 0: tool allowed (or app closed: allows and logs to stderr)
 *   - Exit 2: tool denied by policy (or user rejected via approval card)
 */
import { callMcpTool } from '../mcp-shim/client';

export const POLICY_EVALUATE_TOOL = 'policy.evaluate';

export interface PolicyHookIO {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

export async function runPolicyHook(
  io: PolicyHookIO = { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
  caller: typeof callMcpTool = callMcpTool,
): Promise<number> {
  const chunks: Buffer[] = [];
  for await (const chunk of io.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();

  let hookInput: unknown = {};
  if (raw) {
    try {
      hookInput = JSON.parse(raw);
    } catch {
      hookInput = { raw };
    }
  }

  const response = await caller(POLICY_EVALUATE_TOOL, hookInput);
  if (!response.ok) {
    // With the app closed, allow and log to stderr (never breaking the developer's CLI flow).
    io.stderr.write(`[midnite-policy-hook] ${response.message}; allowing tool call.\n`);
    return 0;
  }

  const result = response.value as { decision: 'allow' | 'deny'; reason: string } | undefined;
  if (result?.decision === 'deny') {
    io.stderr.write(`[midnite-policy-hook] Denied by policy: ${result.reason}\n`);
    io.stdout.write(JSON.stringify({ decision: 'deny', reason: result.reason }) + '\n');
    return 2;
  }

  io.stdout.write(JSON.stringify({ decision: 'allow' }) + '\n');
  return 0;
}

if (typeof require !== 'undefined' && require.main === module) {
  void runPolicyHook().then((code) => {
    if (code !== 0) process.exit(code);
  });
}
