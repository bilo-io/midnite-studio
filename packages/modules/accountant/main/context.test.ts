// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createAccountantServices } from './context';

describe('createAccountantServices', () => {
  it('carries the host app and pickers, over a service that never throws', async () => {
    const services = createAccountantServices({ appDataBase: '/tmp/x', appId: 'money', pickCsv: async () => null, saveCsv: async () => null, send: () => {} });
    expect(services.appId).toBe('money');
    expect(await services.service.listBooks()).toMatchObject({ ok: false, kind: 'io' });
  });
});
