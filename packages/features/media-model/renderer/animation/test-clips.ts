import type { AnimationClip } from '@midnite/studio-shared';

/** A manifest entry for a test, with every required field filled in; override what the test is about. */
export function makeClip(over: Partial<AnimationClip> & Pick<AnimationClip, 'id' | 'name'>): AnimationClip {
  return {
    tags: [],
    durationSec: 1.5,
    frameCount: 45,
    fps: 30,
    boneCount: 65,
    hasSkin: false,
    format: 'fbx',
    source: 'mixamo',
    licence: 'mixamo-eula',
    author: 'Adobe Mixamo',
    sha256: over.id.padEnd(64, '0'),
    file: `clips/${over.id}-${over.name.toLowerCase().replace(/\W+/g, '-')}.fbx`,
    sizeBytes: 2048,
    addedAt: 1_700_000_000_000,
    ...over,
  };
}

export const SAMPLE_CLIPS: AnimationClip[] = [
  makeClip({ id: 'aaaaaaaaaaaa', name: 'Walking', tags: ['locomotion'], durationSec: 1.07, sizeBytes: 5000, addedAt: 3 }),
  makeClip({ id: 'bbbbbbbbbbbb', name: 'Sword Slash', tags: ['combat'], durationSec: 2.4, sizeBytes: 9000, addedAt: 1, hasSkin: true }),
  makeClip({ id: 'cccccccccccc', name: 'Idle Breathing', tags: ['idle'], durationSec: null, source: 'sketchfab', licence: 'cc-by', author: 'Ana', site: 'sketchfab.com', originalUrl: 'https://sketchfab.com/3d-models/idle', format: 'glb', sizeBytes: 100, addedAt: 2 }),
  makeClip({ id: 'dddddddddddd', name: 'Run Forward', tags: ['locomotion', 'in-place'], durationSec: 0.8, sizeBytes: 3000, addedAt: 4 }),
];
