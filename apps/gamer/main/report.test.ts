// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { EVENT_CHANNELS } from '@midnite/studio-shared';

import { reportMenuTemplate } from './report';

describe('Gamer report wiring', () => {
  it('puts Report an Issue… first in Help and sends reportOpen to the window', () => {
    const send = vi.fn();
    const help = reportMenuTemplate(send).find((item) => item.role === 'help');
    expect(help?.submenu?.[0]?.label).toBe('Report an Issue…');
    help?.submenu?.[0]?.click?.();
    expect(send).toHaveBeenCalledWith(EVENT_CHANNELS.reportOpen, undefined);
  });
});
