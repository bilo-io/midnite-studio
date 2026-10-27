import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }));
vi.mock('../log', () => ({ defaultLogger: { warn: vi.fn(), info: vi.fn() } }));

import { createStudioMirrorHost } from './mirror-host-wiring';

describe('studio mirror host', () => {
  it('builds a host whose start and stop are safe with no mirrors.json', async () => {
    const host = createStudioMirrorHost('/nonexistent-mirror-host-dir');
    await expect(host.start()).resolves.toBeUndefined();
    host.stop();
  });
});
