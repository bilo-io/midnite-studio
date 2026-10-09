import { MCP_SERVER_NAME } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { createAgyRegistration } from './agy-registration';

/** vitest: Antigravity registration against a fake config file — consent, merge, stale entries, damaged JSON. */
const PATH = '/home/u/.gemini/antigravity/mcp_config.json';
const LAUNCH = { command: '/App/Midnite', args: ['/App/mcp-shim.js'], env: { ELECTRON_RUN_AS_NODE: '1' } };

function kit(initial: string | null) {
  const files = new Map<string, string>();
  if (initial !== null) files.set(PATH, initial);
  const writes: string[] = [];
  const registration = createAgyRegistration({
    configPath: PATH,
    readFile: async (p) => files.get(p) ?? null,
    writeFile: async (p, text) => {
      writes.push(text);
      files.set(p, text);
    },
    shimLaunch: () => LAUNCH,
  });
  return { registration, files, writes };
}

describe('Antigravity registration', () => {
  it('refuses to write without consent', async () => {
    const { registration, writes } = kit(null);
    // @ts-expect-error — the wire type forbids `false`; main must refuse it anyway.
    const result = await registration.register({ consent: false });
    expect(result).toMatchObject({ ok: false });
    expect(writes).toHaveLength(0);
    expect(await registration.status()).toMatchObject({ ok: true, value: { registered: false, configPath: PATH } });
  });

  it('creates the config when there is none, then reads back as registered', async () => {
    const { registration, files } = kit(null);
    expect(await registration.register({ consent: true })).toMatchObject({ ok: true, value: { registered: true } });
    expect(JSON.parse(files.get(PATH)!)).toEqual({ mcpServers: { [MCP_SERVER_NAME]: LAUNCH } });
  });

  it('keeps every other server and key, and removes only its own entry on unregister', async () => {
    const original = { theme: 'dark', mcpServers: { other: { command: 'x', args: ['y'] } } };
    const { registration, files } = kit(JSON.stringify(original));
    await registration.register({ consent: true });
    expect(JSON.parse(files.get(PATH)!)).toMatchObject({ theme: 'dark', mcpServers: { other: { command: 'x' }, [MCP_SERVER_NAME]: { command: '/App/Midnite' } } });
    expect(await registration.unregister()).toMatchObject({ ok: true, value: { registered: false } });
    expect(JSON.parse(files.get(PATH)!)).toEqual(original);
  });

  it('treats an entry pointing at another build as not registered, so it can be re-registered', async () => {
    const stale = { mcpServers: { [MCP_SERVER_NAME]: { command: '/Old/Midnite', args: ['/Old/mcp-shim.js'] } } };
    const { registration, files } = kit(JSON.stringify(stale));
    expect(await registration.status()).toMatchObject({ value: { registered: false } });
    await registration.register({ consent: true });
    expect(JSON.parse(files.get(PATH)!).mcpServers[MCP_SERVER_NAME].args).toEqual(['/App/mcp-shim.js']);
  });

  it('leaves a config it cannot parse alone', async () => {
    const { registration, writes } = kit('{ not json');
    expect(await registration.register({ consent: true })).toMatchObject({ ok: false });
    expect(await registration.unregister()).toMatchObject({ ok: false });
    expect(writes).toHaveLength(0);
  });

  it('unregistering when nothing is registered writes nothing', async () => {
    const { registration, writes } = kit('{}');
    expect(await registration.unregister()).toMatchObject({ ok: true, value: { registered: false } });
    expect(writes).toHaveLength(0);
  });
});
