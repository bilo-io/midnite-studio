import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import './zod-jitless';

describe('zod-jitless', () => {
  it('turns zod jitless so it never probes `new Function` under the CSP', () => {
    expect(z.config().jitless).toBe(true);
  });

  it('still parses objects on the non-JIT path', () => {
    const schema = z.object({ a: z.number(), b: z.string().optional() });
    expect(schema.parse({ a: 1 })).toEqual({ a: 1 });
    expect(schema.safeParse({ a: 'x' }).success).toBe(false);
  });
});
