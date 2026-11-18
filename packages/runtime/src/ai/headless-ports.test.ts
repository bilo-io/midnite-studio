import { describe, expect, it, vi } from 'vitest';

import { createHeadlessTextPorts, probeAgents, runOllamaHttp } from './headless-ports';

describe('probeAgents', () => {
  it('lists the probe CLIs found on PATH in probe order, and nothing else', () => {
    const found = probeAgents({
      env: { PATH: '/a:/b' },
      isExecutable: (p) => p === '/b/codex' || p === '/a/claude' || p === '/a/cursor-agent',
    });
    expect(found.map((a) => a.id)).toEqual(['claude', 'codex']);
  });
  it('finds nothing on an empty PATH', () => {
    expect(probeAgents({ env: {}, isExecutable: () => true })).toEqual([]);
  });
});

describe('runOllamaHttp', () => {
  it('posts one non-streaming chat and returns the content', async () => {
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({ message: { content: 'hi' } }), { status: 200 }));
    const out = await runOllamaHttp('llama3', 'p', 1000, { fetch: fetchStub as unknown as typeof fetch, ollamaBaseUrl: 'http://x' });
    expect(out).toEqual({ ok: true, data: 'hi' });
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/api/chat');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'llama3', stream: false });
  });
  it('turns a status or a network error into a sentence', async () => {
    const bad = await runOllamaHttp('m', 'p', 1000, { fetch: (async () => new Response('', { status: 500 })) as unknown as typeof fetch });
    expect(bad).toEqual({ ok: false, message: 'Ollama answered 500 for m.' });
    const down = await runOllamaHttp('m', 'p', 1000, {
      fetch: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    expect(down.ok).toBe(false);
  });
});

describe('createHeadlessTextPorts', () => {
  it('runs a process through the injected spawn and returns its stdout', async () => {
    const ports = createHeadlessTextPorts({
      spawn: () => {
        let onOut: (c: string) => void = () => undefined;
        let onClose: (c: number | null) => void = () => undefined;
        queueMicrotask(() => {
          onOut('hello');
          onClose(0);
        });
        return {
          onStdout: (h) => (onOut = h),
          onStderr: () => undefined,
          onError: () => undefined,
          onClose: (h) => (onClose = h),
          kill: () => undefined,
        };
      },
    });
    expect(await ports.runProcess('x', [], { timeoutMs: 1000 })).toEqual({ ok: true, stdout: 'hello' });
  });
});
