import { spawn } from 'node:child_process';
import * as net from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MCP_TOOL_IDS, VIEW_IDS } from '@midnite/studio-shared';

import { createFrameDecoder, encodeJsonFrame } from '../broker/protocol';
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

/**
 * Speak newline-delimited JSON-RPC to the shim over real stdio, resolving as
 * soon as every request carrying an `id` has a matching response — never a
 * fixed sleep. A real child process (module load, the MCP SDK's own
 * handshake) has no guaranteed latency, and a hardcoded "wait N ms then
 * check" window is exactly the kind of test that passes locally and flakes
 * under CI's heavier parallel load. `timeoutMs` is the ceiling for a run
 * that never answers at all.
 */
function runShim(
  requests: Array<Record<string, unknown>>,
  opts: { homeDir: string; timeoutMs?: number; args?: string[] },
): Promise<{ lines: string[]; parsed: JsonRpcLine[] }> {
  const expectedIds = new Set(
    requests.map((r) => r['id']).filter((id): id is number => typeof id === 'number'),
  );

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bundlePath, ...(opts.args ?? [])], {
      env: { ...process.env, HOME: opts.homeDir, APPDATA: join(opts.homeDir, 'AppData', 'Roaming') },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let settled = false;

    const parseStdout = (): { lines: string[]; parsed: JsonRpcLine[] } => {
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
      return { lines, parsed };
    };

    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(parseStdout());
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (expectedIds.size === 0) return;
      const { parsed } = parseStdout();
      const answeredIds = new Set(parsed.map((m) => m.id).filter((id): id is number => typeof id === 'number'));
      if ([...expectedIds].every((id) => answeredIds.has(id))) finish();
    });

    // Consumed, not just piped: an unread stderr pipe can backpressure a
    // child's own `process.stderr.write` (the shim's "[mcp-shim] ready" line)
    // enough to stall the rest of its output indefinitely.
    child.stderr.resume();

    // A ceiling for a shim that never answers at all, deliberately far above
    // any plausible spawn + esbuild-bundle-load + handshake cost. It is not a
    // latency budget: at 8s a loaded machine running the full suite tripped it,
    // and the failure then read as "expected undefined to be truthy" — a shim
    // that never replied — rather than as a busy machine.
    const timer = setTimeout(finish, opts.timeoutMs ?? 30_000);

    child.on('error', reject);

    for (const request of requests) {
      child.stdin.write(`${JSON.stringify(request)}\n`);
    }
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

  /**
   * Phase 81 Theme F's own acceptance condition — the doc's claim that the
   * shim needs "no change" rests on `tools/list` reading straight off
   * `MCP_TOOLS` (`index.ts`'s `ListToolsRequestSchema` handler, unedited by
   * this theme): a tool added to the registry, closed `z.enum`s included,
   * appears here automatically. The list-equality test above already proves
   * this generically; this one pins the count and one tool's JSON schema so
   * a future registry change that silently drops `ui.*` fails here by name.
   */
  it('lists every registered tool, with ui.navigate’s view as a JSON-schema enum of VIEW_IDS', async () => {
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
      const tools =
        (listResponse?.result as
          | { tools?: Array<{ name: string; inputSchema?: { properties?: Record<string, unknown> } }> }
          | undefined
        )?.tools ?? [];
      expect(tools).toHaveLength(MCP_TOOL_IDS.length);
      // Phase 99 Theme G: the model_* tools are listed like any other, so an agent can plan around them.
      expect(tools.map((t) => t.name)).toContain('model_render_preview');

      const uiNavigate = tools.find((t) => t.name === 'ui.navigate');
      const viewProperty = uiNavigate?.inputSchema?.properties?.['view'] as { enum?: string[] } | undefined;
      expect(viewProperty?.enum?.slice().sort()).toEqual([...VIEW_IDS].sort());
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }, 10_000);

  it('answers tools/call with the not-running error when no socket exists', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mstudio-mcp-shim-home-'));
    try {
      const { parsed } = await runShim(
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'repo.list', arguments: {} } },
        ],
        { homeDir: home },
      );

      // No wall-clock assertion here. This spec drives the shim as a real child
      // process, so any elapsed-time bound it measures is dominated by spawn and
      // bundle load, not by the behaviour under test — and with `HOME` a fresh
      // temp dir there is no `<userData>/mcp/` at all, so `callMcpTool` takes its
      // synchronous "no socket path resolves" return and never arms
      // `CALL_TIMEOUT_MS`. The old `< 3000ms` bound therefore asserted startup
      // latency, which a loaded machine blows while the behaviour is perfectly
      // correct. That the shim answers at all is already enforced by `runShim`'s
      // hang guard, and the timing of each not-running path is covered where it
      // can be measured honestly, in `client.test.ts`.
      const callResponse = parsed.find((m) => m.id === 2);
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

  /**
   * Phase 99 Theme G — a tool that answers with pictures (`model_render_preview`) must reach the
   * client as MCP image blocks, not as base64 inside a text block; and `--socket` points the shim
   * at one run's private server instead of the app's global one.
   */
  it('hands image content blocks to the client and dials the --socket it was given', async () => {
    const home = await mkdtemp(join(tmpdir(), 'mstudio-mcp-shim-home-'));
    const sockDir = await mkdtemp(join(tmpdir(), 'mshim-'));
    const socketPath = join(sockDir, 's.sock');
    const seen: Array<{ tool?: string }> = [];
    const server = net.createServer((socket) => {
      const decoder = createFrameDecoder(1024 * 1024);
      socket.on('data', (chunk) => {
        for (const frame of decoder.push(chunk)) {
          if (frame.type !== 0x00) continue;
          const request = frame.message as unknown as { id: string; tool: string };
          seen.push({ tool: request.tool });
          socket.write(
            encodeJsonFrame({
              id: request.id,
              ok: true,
              value: { _content: [{ type: 'text', text: 'front' }, { type: 'image', data: 'aGk=', mimeType: 'image/png' }] },
            } as never),
          );
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));
    try {
      const { parsed } = await runShim(
        [
          { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
          { jsonrpc: '2.0', method: 'notifications/initialized' },
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'model_render_preview', arguments: { repoPath: '/r', project: 'p', model: 'm.obj' } },
          },
        ],
        { homeDir: home, args: ['--socket', socketPath] },
      );
      const result = parsed.find((m) => m.id === 2)?.result as { content?: Array<{ type: string; data?: string; mimeType?: string }> } | undefined;
      expect(seen).toEqual([{ tool: 'model_render_preview' }]);
      expect(result?.content?.map((c) => c.type)).toEqual(['text', 'image']);
      expect(result?.content?.[1]).toMatchObject({ data: 'aGk=', mimeType: 'image/png' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(home, { recursive: true, force: true });
      await rm(sockDir, { recursive: true, force: true });
    }
  }, 15_000);
});
