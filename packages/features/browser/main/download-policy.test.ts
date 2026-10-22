import { describe, expect, it } from 'vitest';

import { classifyFile, decideDownload, needsGatekeeperAssessment, sanitiseFilename } from './download-policy';

describe('classifyFile', () => {
  it('uses the last extension', () => {
    expect(classifyFile('a.pdf')).toBe('document');
    expect(classifyFile('a.pdf.app')).toBe('executable');
    expect(classifyFile('x.DMG')).toBe('disk-image');
    expect(classifyFile('x.pkg')).toBe('installer');
    expect(classifyFile('x.sh')).toBe('script');
    expect(classifyFile('x.zip')).toBe('archive');
    expect(classifyFile('noext')).toBe('other');
    expect(classifyFile('.hidden')).toBe('other');
  });
});

describe('decideDownload', () => {
  it('allows documents, media and images', () => {
    expect(decideDownload({ filename: 'a.pdf', size: 10 }).action).toBe('allow');
    expect(decideDownload({ filename: 'a.mp3', size: 10 }).action).toBe('allow');
    expect(decideDownload({ filename: 'a.png', size: 0 }).action).toBe('allow');
  });
  it('confirms everything risky or unknown', () => {
    for (const f of ['a.dmg', 'a.pkg', 'a.sh', 'a.zip', 'a.app', 'a.weird', 'a.svg', 'a.html']) {
      expect(decideDownload({ filename: f, size: 10 }).action).toBe('confirm');
    }
  });
  it('refuses over the size cap and from a danger origin, with a reason', () => {
    const big = decideDownload({ filename: 'a.pdf', size: 5000, maxBytes: 1000 });
    expect(big).toMatchObject({ action: 'refuse' });
    const bad = decideDownload({ filename: 'a.pdf', size: 1, originVerdict: 'danger' });
    expect(bad).toMatchObject({ action: 'refuse', reason: expect.stringContaining('dangerous') });
    expect(decideDownload({ filename: 'a.dmg', size: 1, originVerdict: 'caution' }).action).toBe('confirm');
  });
  it('assesses only what Gatekeeper judges', () => {
    expect(needsGatekeeperAssessment('disk-image')).toBe(true);
    expect(needsGatekeeperAssessment('document')).toBe(false);
  });
});

describe('sanitiseFilename', () => {
  it('drops path parts, leading dots and control characters', () => {
    expect(sanitiseFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitiseFilename('..hidden')).toBe('hidden');
    expect(sanitiseFilename('a\u0000b:c')).toBe('a_b_c');
    expect(sanitiseFilename('')).toBe('download');
  });
});
