import type { CompanionVocabulary } from '@midnite/studio-shared';
import { describe, expect, it } from 'vitest';

import { buildAskPrompt } from './ask';

/**
 * Phase 109 Theme G — the `'route'` prompt learns the saved persona profiles'
 * names and the `profile` intent's shapes, so "sound like the narrator again"
 * can route to a switch. Names only: a profile's contents never reach it.
 */

const vocabulary: CompanionVocabulary = {
  views: [{ id: 'graph', label: 'Commit Graph', keywords: 'graph history commits' }],
  settingsPages: [{ id: 'companion', label: 'Companion' }],
  commands: [{ id: 'sync.fetch', label: 'Fetch', group: 'sync', access: 'direct' }],
  skills: [],
  repos: [],
};

describe('the route prompt — persona profiles', () => {
  it('names the saved profiles and every profile shape', () => {
    const prompt = buildAskPrompt({
      kind: 'route',
      text: 'sound like the narrator again',
      repoPath: null,
      vocabulary: { ...vocabulary, profiles: ['Narrator', 'Pirate Captain'] },
    });
    expect(prompt).toContain('Saved persona profiles (voice, personality and what you call the user): Narrator, Pirate Captain.');
    expect(prompt).toContain('{"kind":"profile","op":"switch","name":"<a profile above>"}');
    expect(prompt).toContain('{"kind":"profile","op":"save","name":"<a new name>"}');
    expect(prompt).toContain('{"kind":"profile","op":"delete","name":"<a profile above>"}');
    expect(prompt).toContain('{"kind":"profile","op":"list"}');
  });

  it('still teaches the save shape with none saved', () => {
    const prompt = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null, vocabulary: { ...vocabulary, profiles: [] } });
    expect(prompt).toContain('No persona profiles are saved yet.');
    expect(prompt).toContain('"op":"save"');
  });

  it('adds nothing when the vocabulary carries no profiles field', () => {
    const prompt = buildAskPrompt({ kind: 'route', text: 'x', repoPath: null, vocabulary });
    expect(prompt).not.toContain('"kind":"profile"');
  });
});
