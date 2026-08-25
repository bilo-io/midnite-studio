import { describe, expect, it } from 'vitest';

import { languageForFile, previewKindForFile } from './languages';

describe('languageForFile', () => {
  it.each([
    ['graph-view.tsx', 'tsx'],
    ['index.ts', 'typescript'],
    ['moon.yml', 'yaml'],
    ['Dockerfile', 'docker'],
    ['Makefile', 'make'],
    ['.gitignore', 'ini'],
    ['README.md', 'markdown'],
  ])('%s → %s', (name, lang) => {
    expect(languageForFile(name)).toBe(lang);
  });

  it('returns null for unknown extensions and extensionless names', () => {
    expect(languageForFile('LICENSE')).toBeNull();
    expect(languageForFile('archive.xyz')).toBeNull();
  });
});

describe('previewKindForFile', () => {
  it.each([
    ['logo.png', 'image'],
    ['demo.MP4', 'video'],
    ['track.mp3', 'audio'],
    ['spec.pdf', 'pdf'],
    ['README.md', 'markdown'],
    ['index.ts', 'text'],
    ['LICENSE', 'text'],
  ])('%s → %s', (name, kind) => {
    expect(previewKindForFile(name)).toBe(kind);
  });
});
