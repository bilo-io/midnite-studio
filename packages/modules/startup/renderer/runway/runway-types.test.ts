import { describe, expect, it } from 'vitest';

import { formatMinor } from './runway-types';

describe('formatMinor', () => {
  it('always shows both minor digits for a 2-decimal currency', () => {
    expect(formatMinor(-117320, 'GBP')).toBe('-£1,173.20');
    expect(formatMinor(50000, 'GBP')).toBe('£500.00');
    expect(formatMinor(-3026013, 'GBP')).toBe('-£30,260.13');
  });

  it('shows no minor digits for a currency that has none', () => {
    expect(formatMinor(1200, 'JPY')).toBe('¥1,200');
  });
});
