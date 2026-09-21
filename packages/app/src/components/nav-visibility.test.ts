import { describe, expect, it } from 'vitest';

import {
  COMMAND_NAV_VIEW,
  isNavViewVisible,
  navCommandDisabledReason,
  RAIL_VIEW_IDS,
} from './nav-visibility';

describe('RAIL_VIEW_IDS', () => {
  it('lists Sessions immediately after Knowledge, matching the pinned rail', () => {
    expect(RAIL_VIEW_IDS.indexOf('sessions')).toBe(RAIL_VIEW_IDS.indexOf('knowledge') + 1);
  });
});

describe('isNavViewVisible', () => {
  it('defaults every rail view to visible', () => {
    expect(isNavViewVisible({}, 'graph')).toBe(true);
  });

  it('treats landing and settings as always visible', () => {
    expect(isNavViewVisible({ landing: false, settings: false }, 'landing')).toBe(true);
    expect(isNavViewVisible({ landing: false, settings: false }, 'settings')).toBe(true);
  });

  it('hides a view when its entry is false', () => {
    expect(isNavViewVisible({ graph: false }, 'graph')).toBe(false);
  });
});

describe('navCommandDisabledReason', () => {
  it('returns a reason for gated navigation commands when the view is hidden', () => {
    for (const commandId of Object.keys(COMMAND_NAV_VIEW)) {
      const view = COMMAND_NAV_VIEW[commandId as keyof typeof COMMAND_NAV_VIEW]!;
      expect(navCommandDisabledReason({ [view]: false }, commandId as keyof typeof COMMAND_NAV_VIEW)).toMatch(
        /Hidden in Settings/,
      );
    }
  });

  it('returns undefined when the destination is visible', () => {
    expect(navCommandDisabledReason({}, 'view.graph')).toBeUndefined();
  });
});
