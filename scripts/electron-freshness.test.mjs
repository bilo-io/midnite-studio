import { describe, expect, it } from 'vitest';
import { judge, pinnedMajor, supportedMajors } from './electron-freshness.mjs';

const releases = ['41.0.1', '41.0.0', '40.2.0', '39.8.1', '38.9.0'].map((version) => ({ version }));

describe('electron-freshness', () => {
  it('reads the major from a range', () => expect(pinnedMajor('^33.2.0')).toBe(33));
  it('takes the three newest majors', () => expect(supportedMajors(releases)).toEqual([41, 40, 39]));
  it('warns when outside the window and passes inside it', () => {
    expect(judge(33, [41, 40, 39]).ok).toBe(false);
    expect(judge(40, [41, 40, 39]).ok).toBe(true);
  });
  it('never fails on missing data', () => expect(judge(null, []).ok).toBe(true));
});
