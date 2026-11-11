import { describe, expect, it } from 'vitest';
import * as lu from 'react-icons/lu';
import * as pi from 'react-icons/pi';

import { SCIENCE_NAV_GROUP } from './science-nav';

describe('SCIENCE_NAV_GROUP', () => {
  it('lists Notebooks then Templates', () => {
    expect(SCIENCE_NAV_GROUP.views.map((v) => v.id)).toEqual(['notebooks', 'templates']);
  });

  it('every icon resolves', () => {
    expect(pi.PiFlaskFill).toBeDefined();
    expect(lu.LuNotebookText).toBeDefined();
    expect(lu.LuLayoutTemplate).toBeDefined();
  });
});
