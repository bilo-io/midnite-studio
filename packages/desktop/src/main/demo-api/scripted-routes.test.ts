import { WORKFLOW_DELAY_MAX_MS } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { capDelayMs } from './scripted-routes';

/**
 * `capDelayMs` in isolation, no server involved: `/demo/delay` is capped at
 * `WORKFLOW_DELAY_MAX_MS` (a full minute), and a test asserting the cap has
 * no business actually waiting that long — this asserts the pure decision,
 * never elapsed wall time.
 */
describe('capDelayMs', () => {
  it('passes a requested delay under the cap through unchanged', () => {
    expect(capDelayMs(0)).toBe(0);
    expect(capDelayMs(250)).toBe(250);
    expect(capDelayMs(WORKFLOW_DELAY_MAX_MS)).toBe(WORKFLOW_DELAY_MAX_MS);
  });

  it('caps a requested delay past WORKFLOW_DELAY_MAX_MS', () => {
    expect(capDelayMs(WORKFLOW_DELAY_MAX_MS + 1)).toBe(WORKFLOW_DELAY_MAX_MS);
    expect(capDelayMs(999_999_999)).toBe(WORKFLOW_DELAY_MAX_MS);
  });

  it('treats a negative or non-finite request as zero', () => {
    expect(capDelayMs(-5)).toBe(0);
    expect(capDelayMs(Number.NaN)).toBe(0);
    expect(capDelayMs(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('truncates a fractional ms', () => {
    expect(capDelayMs(10.9)).toBe(10);
  });
});
