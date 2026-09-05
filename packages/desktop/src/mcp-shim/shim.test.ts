import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_TOOL_IDS } from '@midnite/studio-shared';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Exercises the actual bundled shim as a real child process — the one live
 * process this file's own test discipline calls for (everything else in
 * this directory is unit-level). Built once with esbuild, the same way
 * `bundle.mjs` builds it for real, so the test is against what actually
 * ships rather than against `ts-node`-transpiled semantics that could differ.
 */

let bundlePath: string;
let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'mstudio-mcp-shim-'));
  bundlePath = join(workDir, 'mcp-shim.cjs');
  await build({
    entryPoints: [join(__dirname, 'index.ts')],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron', 'node-pty', 'dugite'],
    logLevel: 'silent',
  });
}, 30_000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

type JsonRpcLine = { id?: number; result?: unknown; error?: unknown };

/** Speak newline-delimited JSON-RPC to the shim over real stdio, collecting every line it writes. */
function runShim(
  requests: Array<Record<string, unknown>>,
  opts: { homeDir: string; timeoutMs?: number },
): Promise<{ lines: string[]; parsed: JsonRpcLine[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundlePath], {
      env: { ...process.env, HOME: opts.homeDir, APPDATA: join(opts.homeDir, 'AppData', 'Roaming') },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    // Consumed, not just piped: an unread stderr pipe can backpressure a
    // child's own `process.stderr.write` (the shim's "[mcp-shim] ready" line)
    // enough to stall it well past this test's 1.5s happy-path window.
    child.stderr.resume();

    const timer = setTimeout(() => {
      child.kill();
      finish();
    }, opts.timeoutMs ?? 5000);

    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      const lines = stdout.split('\n').filter((line) => line.length > 0);
      const parsed = lines
        .map((line) => {
          try {
            return JSON.parse(line) as JsonRpcLine;
          } catch {
            return null;
          }
        })
        .filter((v): v is JsonRpcLine => v !== null);
      resolve({ lines, parsed });
    };

    child.on('error', reject);

    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }

    // Give the child a moment to answer everything, then finish rather than
    // waiting out the full timeout on the happy path.
    setTimeout(finish, 1500);
  });
}

describe('mcp stdio shim', () => {
  it('answers tools/list from the registry with the socket absent', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mstudio-mcp-shim-home-'));
    try {
      const { parsed } = await runShim(
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
        ],
        { homeDir: home },
      );

      const listResponse = parsed.find((m) => m.id === 2);
      expect(listResponse).toBeTruthy();
      const tools = (listResponse?.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? [];
      expect(tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_IDS].sort());
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('answers tools/call with the not-running error when no socket exists, within 2s', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mstudio-mcp-shim-home-'));
    try {
      const started = Date.now();
      const { parsed } = await runShim(
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'repo.list', arguments: {} } },
        ],
        { homeDir: home },
      );

      const callResponse = parsed.find((m) => m.id === 2);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(callResponse).toBeTruthy();
      const result = callResponse?.result as { isError?: boolean; content?: Array<{ text?: string }> } | undefined;
      expect(result?.isError).toBe(true);
      expect(result?.content?.[0]?.text).toMatch(/not running|MCP server is off/i);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('writes only well-formed JSON-RPC lines to stdout across a session', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mstudio-mcp-shim-home-'));
    try {
      const { lines, parsed } = await runShim(
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
          { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'not.a.tool', arguments: {} } },
        ],
        { homeDir: home },
      );

      // Every non-empty stdout line parsed as JSON — nothing else was ever
      // written there, even though the shim also logs its own diagnostics.
      expect(parsed.length).toBe(lines.length);
      expect(parsed.length).toBeGreaterThanOrEqual(2);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);
});
