// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { unionBridgeSlices } from './bridge-slice';

describe('unionBridgeSlices', () => {
  it('merges namespaces key by key and keeps every slice’s own namespaces', () => {
    const a = { terminal: { list: () => 'a' }, vanguard: { x: 1 } };
    const b = { terminal: { list: () => 'b', other: 2 }, vault: { y: 3 } };
    const u = unionBridgeSlices<{ terminal: { list: () => string; other: number }; vanguard: { x: number }; vault: { y: number } }>(a, b);
    expect(u.terminal.list()).toBe('a');
    expect(u.terminal.other).toBe(2);
    expect(u.vanguard.x).toBe(1);
    expect(u.vault.y).toBe(3);
  });

  it('does not mutate its inputs', () => {
    const a = { ns: { one: 1 } };
    const b = { ns: { two: 2 } };
    unionBridgeSlices(a, b);
    expect(a).toEqual({ ns: { one: 1 } });
    expect(b).toEqual({ ns: { two: 2 } });
  });
});
