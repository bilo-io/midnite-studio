import { describe, expect, it } from 'vitest';

import type { Contract } from '@midnite/studio-shared';

import { addMonths, contractStatus, currentTermEnd, noticeDeadline } from './contract-dates';

const base: Contract = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Hosting',
  counterparty: { kind: 'vendor', id: '00000000-0000-4000-8000-000000000002' },
  start: '2025-01-01',
  autoRenews: false,
  noticeDays: 0,
};

describe('contract dates', () => {
  it('rolls a 12-month auto-renewing contract to 2026-12-31 and puts the deadline 30 days earlier', () => {
    const c: Contract = { ...base, end: '2025-12-31', autoRenews: true, renewalTermMonths: 12, noticeDays: 30 };
    expect(currentTermEnd(c, '2026-11-11')).toBe('2026-12-31');
    expect(noticeDeadline(c, '2026-11-11')).toBe('2026-12-01');
    expect(contractStatus(c, '2026-11-11')).toBe('notice-due');
  });

  it('is ended once a non-renewing contract is past its end, and ending inside 30 days', () => {
    const c: Contract = { ...base, end: '2026-06-30' };
    expect(currentTermEnd(c, '2026-11-11')).toBe('2026-06-30');
    expect(contractStatus(c, '2026-11-11')).toBe('ended');
    expect(contractStatus({ ...base, end: '2026-11-30' }, '2026-11-11')).toBe('ending');
    expect(contractStatus({ ...base, end: '2027-06-30' }, '2026-11-11')).toBe('active');
  });

  it('keeps an open-ended contract active and a far-off renewal active', () => {
    expect(contractStatus(base, '2026-11-11')).toBe('active');
    expect(currentTermEnd(base, '2026-11-11')).toBeNull();
    const c: Contract = { ...base, end: '2025-12-31', autoRenews: true, renewalTermMonths: 12, noticeDays: 30 };
    expect(contractStatus(c, '2026-02-01')).toBe('active');
  });

  it('clamps the day when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-30', 3)).toBe('2027-02-28');
  });
});
