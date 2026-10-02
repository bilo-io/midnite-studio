import { describe, expect, it } from 'vitest';

import { dividerColors } from './diff-divider';
import { laneColor } from './lane-colors';

describe('dividerColors', () => {
  it('runs from the row lane colour to the row below it', () => {
    expect(dividerColors(2, 5, 'vivid')).toEqual({
      from: laneColor(2, 'vivid'),
      to: laneColor(5, 'vivid'),
    });
  });

  it('stays one colour when there is no row below', () => {
    const { from, to } = dividerColors(3, undefined, 'muted');
    expect(from).toBe(to);
  });
});
