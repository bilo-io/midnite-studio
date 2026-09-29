import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { GraphHeader } from './graph-header';
import { graphThemeFor } from './graph-themes';

/**
 * The narrow-window contract: the commit message keeps a real minimum width,
 * and the BRANCH / TAG column (then the CI column) gives way first.
 *
 * jsdom lays nothing out and loads no stylesheet, so this pins the half a
 * layout depends on that it can see: every header cell opts into the
 * `styles.css` rules (`.graph-msg-col`, `.graph-ref-col`, `.graph-ci-col`).
 * The layout itself is exercised at 760px by `midnite-menu.spec.ts`, which
 * waits for the "Commit message" header to be visible.
 */
describe('graph columns in a narrow window', () => {
  afterEach(cleanup);

  it('opts the header cells into those rules', () => {
    const resizable = { current: 100 } as never;
    const { getByRole } = render(
      <GraphHeader
        refs={[]}
        authors={[]}
        gutterWidth={24}
        columns={{ branchTag: resizable, graph: resizable, author: resizable, date: resizable, sha: resizable }}
        theme={graphThemeFor('default', 'comfortable')}
      />,
    );
    expect(getByRole('columnheader', { name: 'Commit message' }).className).toContain('graph-msg-col');
    expect(getByRole('columnheader', { name: 'Branch / Tag' }).className).toContain('graph-ref-col');
    expect(getByRole('columnheader', { name: 'CI' }).className).toContain('graph-ci-col');
  });
});
