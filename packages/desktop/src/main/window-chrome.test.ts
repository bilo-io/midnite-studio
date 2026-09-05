import { describe, expect, it } from 'vitest';

import { TRAFFIC_LIGHT_POSITION, windowFrameless } from './window-chrome';

describe('window-chrome', () => {
  it('TRAFFIC_LIGHT_POSITION centers traffic lights in the 48px titlebar', () => {
    expect(TRAFFIC_LIGHT_POSITION).toEqual({ x: 16, y: 13 });
  });

  it('windowFrameless matches darwin platform check', () => {
    expect(windowFrameless()).toBe(process.platform === 'darwin');
  });
});
