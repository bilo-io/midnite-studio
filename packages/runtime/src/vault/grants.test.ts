import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { BROWSER_AGENT_PRINCIPAL } from '../app-id';
import { createVaultGrants, VAULT_GRANTS_FILE } from './grants';
import { createFakeCipher } from './testing';
import { createVaultService, VaultAccessDeniedError } from './vault-service';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mstudio-vault-grants-'));
});

function setup() {
  const grants = createVaultGrants({ directory: dir });
  const service = createVaultService({ directory: dir, cipher: createFakeCipher(), authorize: grants.authorize });
  return { grants, service };
}

describe('vault grants', () => {
  it('denies every other app by default, and always allows studio and vault', async () => {
    const { service } = setup();
    await service.forApp('studio').set('secrets', 'agent.claude.apiKey', 'sk-1');
    expect(await service.forApp('vault').get('secrets', 'agent.claude.apiKey')).toBe('sk-1');
    const other = service.forApp('browser');
    expect(await other.get('secrets', 'agent.claude.apiKey')).toBeNull();
    expect(await other.has('secrets', 'agent.claude.apiKey')).toBe(false);
    expect(await other.keys('secrets')).toEqual([]);
    await expect(other.set('secrets', 'x', 'y')).rejects.toBeInstanceOf(VaultAccessDeniedError);
  });

  it('a grant lets the app read, and a namespace grant of named keys covers only those', async () => {
    const { grants, service } = setup();
    const studio = service.forApp('studio');
    await studio.set('secrets', 'a', '1');
    await studio.set('secrets', 'b', '2');
    expect(grants.set('browser', 'secrets', ['a'])).toBe(true);
    const browser = service.forApp('browser');
    expect(await browser.get('secrets', 'a')).toBe('1');
    expect(await browser.get('secrets', 'b')).toBeNull();
    expect(await browser.get('forge-accounts', 'a')).toBeNull();
    grants.set('browser', 'secrets', '*');
    expect(await browser.get('secrets', 'b')).toBe('2');
  });

  it('a revoke takes the access back', async () => {
    const { grants, service } = setup();
    await service.forApp('studio').set('secrets', 'a', '1');
    grants.set('browser', 'secrets', '*');
    expect(await service.forApp('browser').get('secrets', 'a')).toBe('1');
    expect(grants.revoke('browser', 'secrets')).toBe(true);
    expect(await service.forApp('browser').get('secrets', 'a')).toBeNull();
    expect(grants.list().grants).toEqual({});
  });

  it('a second process sees a revoke made elsewhere (re-reads on change)', async () => {
    const a = createVaultGrants({ directory: dir });
    const b = createVaultGrants({ directory: dir });
    const access = { appId: 'browser', namespace: 'secrets', key: 'k', op: 'read' } as const;
    a.set('browser', 'secrets', '*');
    expect(b.authorize(access)).toBe(true);
    a.revoke('browser');
    expect(b.authorize(access)).toBe(false);
  });

  it('a corrupt grants file denies non-studio apps and never widens', async () => {
    await writeFile(join(dir, VAULT_GRANTS_FILE), '{ not json');
    const { grants, service } = setup();
    await service.forApp('studio').set('secrets', 'a', '1');
    expect(await service.forApp('browser').get('secrets', 'a')).toBeNull();
    expect(grants.list().corrupt).toBe(true);
    // Studio is unaffected.
    expect(await service.forApp('studio').get('secrets', 'a')).toBe('1');
  });

  it('a malformed entry drops only that app; a wrong-shaped file denies everyone', async () => {
    await writeFile(
      join(dir, VAULT_GRANTS_FILE),
      JSON.stringify({ version: 1, grants: { browser: { secrets: 'yes' }, monitor: { secrets: '*' } } }),
    );
    const { grants } = setup();
    const read = (appId: 'browser' | 'monitor') => grants.authorize({ appId, namespace: 'secrets', key: 'k', op: 'read' });
    expect(read('browser')).toBe(false);
    expect(read('monitor')).toBe(true);
    expect(grants.list().corrupt).toBe(true);

    await writeFile(join(dir, VAULT_GRANTS_FILE), JSON.stringify({ grants: ['*'] }));
    const fresh = createVaultGrants({ directory: dir });
    expect(fresh.authorize({ appId: 'monitor', namespace: 'secrets', key: 'k', op: 'read' })).toBe(false);
  });

  it('nothing to grant studio or vault, and the file holds names only', async () => {
    const { grants } = setup();
    expect(grants.set('studio', 'secrets', '*')).toBe(false);
    expect(grants.set('vault', 'secrets', '*')).toBe(false);
    grants.set('browser', 'secrets', ['agent.claude.apiKey']);
    const raw = await readFile(join(dir, VAULT_GRANTS_FILE), 'utf8');
    expect(JSON.parse(raw)).toEqual({ version: 1, grants: { browser: { secrets: ['agent.claude.apiKey'] } } });
  });
});

describe('the browser agent principal (Phase 117 Theme G)', () => {
  it('can never be granted, so an agent session reads no vault value', async () => {
    const { grants, service } = setup();
    await service.forApp('studio').set('secrets', 'agent.claude.apiKey', 'sk-live-1');
    expect(grants.set(BROWSER_AGENT_PRINCIPAL, 'secrets', '*')).toBe(false);
    const agent = service.forApp(BROWSER_AGENT_PRINCIPAL);
    expect(await agent.get('secrets', 'agent.claude.apiKey')).toBeNull();
    expect(await agent.read('secrets', 'agent.claude.apiKey')).toEqual({ ok: false, kind: 'denied' });
    expect(await agent.has('secrets', 'agent.claude.apiKey')).toBe(false);
    expect(await agent.keys('secrets')).toEqual([]);
    await expect(agent.set('secrets', 'x', 'y')).rejects.toBeInstanceOf(VaultAccessDeniedError);
  });

  it('stays denied when a hand-edited grants file names it', async () => {
    await writeFile(join(dir, VAULT_GRANTS_FILE), JSON.stringify({ version: 1, grants: { 'browser-agent': { secrets: '*' } } }));
    const { grants } = setup();
    expect(grants.authorize({ appId: BROWSER_AGENT_PRINCIPAL, namespace: 'secrets', key: 'a', op: 'read' })).toBe(false);
  });

  it('is refused by the vault service even with an allow-everything authorizer', async () => {
    const service = createVaultService({ directory: dir, cipher: createFakeCipher() });
    await service.forApp('studio').set('secrets', 'k', 'v');
    expect(await service.forApp(BROWSER_AGENT_PRINCIPAL).get('secrets', 'k')).toBeNull();
  });
});
