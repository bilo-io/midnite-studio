// @vitest-environment node
// vitest (node): Mixamo file naming, Mixamo detection and the auto-tag table.
import { describe, expect, it } from 'vitest';

import { autoTags, tokenise } from './auto-tags';
import { clipNameFromFile, detectMixamo } from './mixamo';

describe('clipNameFromFile', () => {
  it.each([
    ['Walking.fbx', 'Walking'],
    ['Sword And Shield Slash.fbx', 'Sword And Shield Slash'],
    ['Standing Idle (1).fbx', 'Standing Idle'],
    ['Walking_withSkin.fbx', 'Walking'],
    ['Walking (Without Skin).fbx', 'Walking'],
    ['Walking Without Skin.fbx', 'Walking'],
    ['X Bot@Running.fbx', 'Running'],
    ['walking_in_place.fbx', 'Walking In Place'],
    ['T-Pose.fbx', 'T-Pose'],
    ['/some/dir/Jump Attack (2)_skin.FBX', 'Jump Attack'],
  ])('%s → %s', (file, name) => {
    expect(clipNameFromFile(file)).toBe(name);
  });

  it('falls back to the take or folder when the file name says nothing', () => {
    expect(clipNameFromFile('mixamo.com.fbx', 'Capoeira')).toBe('Capoeira');
    expect(clipNameFromFile('Take 001.fbx', 'mixamo.com')).toBe('Animation');
    expect(clipNameFromFile('Take 001.fbx', 'mixamo.com', 'Capoeira')).toBe('Capoeira');
    expect(clipNameFromFile('.fbx')).toBe('Animation');
  });

  it('never exceeds the schema limit', () => {
    expect(clipNameFromFile(`${'a'.repeat(300)}.fbx`).length).toBeLessThanOrEqual(120);
  });
});

describe('detectMixamo', () => {
  it('knows a Mixamo skeleton by its prefix, in the FBX and glTF spellings', () => {
    expect(detectMixamo(['mixamorig:Hips'])).toBe(true);
    expect(detectMixamo(['mixamorig_Hips', 'x'])).toBe(true);
    expect(detectMixamo(['mixamorigHips'])).toBe(true);
    expect(detectMixamo(['mixamorig:A', 'mixamorig:B', 'mixamorig:C', 'mixamorig:D', 'mixamorig:E'])).toBe(true);
  });
  it('is not fooled by one stray bone or a different rig', () => {
    expect(detectMixamo(['mixamorig:LeftHand', 'Hips'])).toBe(false);
    expect(detectMixamo(['Hips', 'Spine', 'Head'])).toBe(false);
    expect(detectMixamo([])).toBe(false);
  });
});

describe('autoTags', () => {
  it.each([
    ['Walking', ['locomotion']],
    ['Standing Idle', ['idle']],
    ['Sword And Shield Slash', ['combat']],
    ['Hip Hop Dancing', ['emote']],
    ['Zombie Death', ['reaction']],
    ['Jump Attack', ['combat', 'traversal']],
    ['Walking In Place', ['in-place', 'locomotion']],
    ['Open Door', ['interaction']],
    ['Falling Back Death', ['reaction', 'traversal']],
  ])('%s → %j', (name, tags) => {
    expect(autoTags(name)).toEqual(tags);
  });

  it('matches whole words, not substrings', () => {
    expect(autoTags('White Diesel Hitchhiker')).toEqual([]);
  });

  it('reads the folder too', () => {
    expect(autoTags('Take 4', 'Combat')).toEqual(['combat']);
  });

  it('splits camelCase', () => {
    expect(tokenise('RunForward_v2')).toEqual(['run', 'forward', 'v2']);
  });
});
