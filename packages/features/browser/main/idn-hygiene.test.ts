import { describe, expect, it } from 'vitest';

import { formatHostForDisplay, formatOriginForDisplay, isUniformScript } from './idn-hygiene';

describe('idn-hygiene', () => {
  describe('isUniformScript', () => {
    it('returns true for single-script labels with ASCII hyphens/digits', () => {
      expect(isUniformScript('google')).toBe(true);
      expect(isUniformScript('google-123')).toBe(true);
      expect(isUniformScript('münchen')).toBe(true);
      expect(isUniformScript('клик')).toBe(true);
    });

    it('returns false for mixed-script labels (homographs)', () => {
      // Cyrillic small letter а + Latin 'pple'
      expect(isUniformScript('аpple')).toBe(false);
      // Greek letter omicron + Latin 'oogle'
      expect(isUniformScript('οogle')).toBe(false);
    });
  });

  describe('formatHostForDisplay', () => {
    it('keeps mixed-script IDN domains as punycode', () => {
      // xn--pple-43d.com decodes to Cyrillic 'а' + Latin 'pple.com'
      expect(formatHostForDisplay('xn--pple-43d.com')).toBe('xn--pple-43d.com');
    });

    it('displays uniform-script IDN domains in Unicode', () => {
      // xn--mnchen-3ya.de is münchen.de (all Latin)
      expect(formatHostForDisplay('xn--mnchen-3ya.de')).toBe('münchen.de');
    });

    it('leaves standard ASCII hosts unchanged', () => {
      expect(formatHostForDisplay('example.com')).toBe('example.com');
      expect(formatHostForDisplay('localhost')).toBe('localhost');
    });
  });

  describe('formatOriginForDisplay', () => {
    it('formats origins correctly with protocol and port', () => {
      expect(formatOriginForDisplay('https://xn--pple-43d.com:8443')).toBe('https://xn--pple-43d.com:8443');
      expect(formatOriginForDisplay('https://xn--mnchen-3ya.de/some/path')).toBe('https://münchen.de');
      expect(formatOriginForDisplay('http://localhost:5173/')).toBe('http://localhost:5173');
      expect(formatOriginForDisplay('https://example.com')).toBe('https://example.com');
    });
  });
});
