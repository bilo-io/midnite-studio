import { describe, expect, it } from 'vitest';

import { advisoriesFor, compareVersions, identifyLibrary, vulnerableLibraryForUrl } from './vulnerable-libraries';

describe('identifyLibrary', () => {
  it.each([
    ['https://code.jquery.com/jquery-1.12.4.min.js', 'jquery', '1.12.4'],
    ['https://cdnjs.cloudflare.com/ajax/libs/jquery/3.4.1/jquery.min.js', 'jquery', '3.4.1'],
    ['https://ajax.googleapis.com/ajax/libs/angularjs/1.6.9/angular.min.js', 'angularjs', '1.6.9'],
    ['https://cdn.jsdelivr.net/npm/lodash@4.17.15/lodash.min.js', 'lodash', '4.17.15'],
    ['https://unpkg.com/moment@2.29.1/moment.js', 'moment', '2.29.1'],
    ['https://stackpath.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js', 'bootstrap', '3.3.7'],
    ['https://example.com/vendor/jquery-ui-1.11.4.custom.min.js', 'jquery-ui', '1.11.4'],
    ['https://cdn.jsdelivr.net/npm/debug@4.4.2/src/browser.js', 'debug', '4.4.2'],
  ])('%s → %s %s', (url, library, version) => {
    expect(identifyLibrary(url)).toEqual({ library, version });
  });

  it('ignores Angular 2+ and unversioned or unknown scripts', () => {
    expect(identifyLibrary('https://cdn.jsdelivr.net/npm/@angular/core@15.0.0/fesm2015/core.mjs')).toBeNull();
    expect(identifyLibrary('https://example.com/app.4f3a9.js')).toBeNull();
    expect(identifyLibrary('https://example.com/js/jquery.min.js')).toBeNull();
    expect(identifyLibrary('not a url')).toBeNull();
  });
});

describe('advisoriesFor', () => {
  it('lists jquery 1.12.4 CVEs (acceptance)', () => {
    expect(advisoriesFor('jquery', '1.12.4')).toEqual(['CVE-2020-11023', 'CVE-2020-11022', 'CVE-2019-11358', 'CVE-2015-9251']);
  });
  it('is empty for a fixed release', () => {
    expect(advisoriesFor('jquery', '3.7.1')).toEqual([]);
    expect(advisoriesFor('lodash', '4.17.21')).toEqual([]);
  });
  it('honours a lower bound', () => {
    expect(advisoriesFor('underscore', '1.3.1')).toEqual([]);
    expect(advisoriesFor('underscore', '1.9.1')).toEqual(['CVE-2021-23358']);
  });
  it('flags an exact malicious release only', () => {
    expect(advisoriesFor('debug', '4.4.2')).toEqual(['MALICIOUS-RELEASE-2025-09-08']);
    expect(advisoriesFor('debug', '4.4.1')).toEqual([]);
  });
});

describe('compareVersions', () => {
  it('compares numerically, not lexically', () => {
    expect(compareVersions('1.12.4', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('3.5.0', '3.5.0')).toBe(0);
    expect(compareVersions('3.5.0-rc.1', '3.5.0')).toBe(0);
  });
});

describe('vulnerableLibraryForUrl', () => {
  it('returns the verdict entry, or null for a clean release', () => {
    const url = 'https://code.jquery.com/jquery-1.12.4.min.js';
    expect(vulnerableLibraryForUrl(url)).toMatchObject({ library: 'jquery', version: '1.12.4', url });
    expect(vulnerableLibraryForUrl('https://code.jquery.com/jquery-3.7.1.min.js')).toBeNull();
  });
});
