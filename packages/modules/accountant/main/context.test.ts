// @vitest-environment node
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createAccountantServices } from './context';

describe('createAccountantServices', () => {
  it('carries the host app and pickers, over a real books service under the runtime directory', async () => {
    const base = await mkdtemp(join(tmpdir(), 'acct-ctx-'));
    const sent: unknown[] = [];
    const services = createAccountantServices({ appDataBase: base, appId: 'money', pickCsv: async () => null, saveCsv: async () => null, send: (c, p) => sent.push([c, p]) });
    expect(services.appId).toBe('money');
    expect(await services.service.listBooks()).toEqual({ ok: true, value: { books: [] } });
    const created = await services.service.createBook({ name: 'Acme', entity: 'sole-trader', currency: 'GBP', fiscalYearStart: { month: 4, day: 6 }, template: 'sole-trader' });
    expect(created.ok).toBe(true);
    expect(sent).toHaveLength(1);
    await services.service.dispose();
  });
});
