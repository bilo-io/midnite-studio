import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { buildChangeTree, flattenBySize, type ChangedFile } from './build-change-tree';
import { ChangeTotals, ChangeTree, Counts } from './change-tree';

afterEach(cleanup);

describe('Counts', () => {
  it('formats counts with comma separators when >= 1000', () => {
    render(<Counts insertions={1250} deletions={3400} />);
    expect(screen.getByText('+1,250')).not.toBeNull();
    expect(screen.getByText('−3,400')).not.toBeNull();
  });

  it('formats small counts without separators', () => {
    render(<Counts insertions={15} deletions={3} />);
    expect(screen.getByText('+15')).not.toBeNull();
    expect(screen.getByText('−3')).not.toBeNull();
  });
});

const file = (path: string, insertions = 1, deletions = 0): ChangedFile => ({
  path,
  oldPath: null,
  insertions,
  deletions,
});

/**
 * `ChangeTree`'s own collapse interaction and its list-mode full-path
 * rendering — migrated from `e2e/changes-panel.spec.ts` (Phase 82 Theme C,
 * wave 2): "tree view groups by folder, and a collapsed folder keeps its
 * totals" and the "shows full paths" half of "list view orders by change
 * size and shows full paths" (the ORDERING half is already covered by
 * `build-change-tree.test.ts`'s own `flattenBySize` tests — a pure-function
 * assertion, not a rendering one). Added here rather than to a third,
 * `changes-panel`-shaped test file: the panel's `StatusPanel` wiring is
 * covered in `status-panel.bridge.test.tsx`, but the tree/list RENDERING
 * itself is `ChangeTree`'s own contract, and this file already owns its
 * sibling components' (`Counts`/`ChangeTotals`) tests.
 */
describe('ChangeTree', () => {
  const noop = () => {};

  it('a collapsed directory hides its files but keeps its rolled-up totals', () => {
    const nodes = buildChangeTree([
      file('src/a.ts', 10, 2),
      file('src/nested/b.ts', 5, 1),
    ]);
    const { rerender } = render(
      <ChangeTree
        nodes={nodes}
        selection={{ path: null, onSelect: noop }}
        collapsed={new Set()}
        onToggleDir={noop}
        testId="tree"
      />,
    );

    const tree = screen.getByTestId('tree');
    const src = within(tree).getByRole('button', { name: 'src' });
    expect(src.textContent).toContain('+15');
    expect(within(tree).getByRole('button', { name: 'src/a.ts' })).toBeTruthy();

    // Collapsing is the caller's job (`onToggleDir` only reports the click);
    // re-rendering with the path in `collapsed` is what a real click would
    // have driven the caller to do.
    rerender(
      <ChangeTree
        nodes={nodes}
        selection={{ path: null, onSelect: noop }}
        collapsed={new Set(['src'])}
        onToggleDir={noop}
        testId="tree"
      />,
    );

    expect(within(tree).queryByRole('button', { name: 'src/a.ts' })).toBeNull();
    // Still says how much is inside — collapsing must not hide the number
    // you collapsed in order to compare.
    expect(within(tree).getByRole('button', { name: 'src' }).textContent).toContain(
      '+15',
    );
  });

  it('reports which directory was clicked, letting the caller own collapse state', () => {
    const nodes = buildChangeTree([file('src/a.ts')]);
    const clicks: string[] = [];
    render(
      <ChangeTree
        nodes={nodes}
        selection={{ path: null, onSelect: noop }}
        collapsed={new Set()}
        onToggleDir={(path) => clicks.push(path)}
        testId="tree"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'src' }));
    expect(clicks).toEqual(['src']);
  });

  it('list mode shows the full path instead of the leaf name', () => {
    const nodes = flattenBySize([file('z/huge.lock', 4000, 0), file('a/small.ts', 1, 1)]);
    render(
      <ChangeTree
        nodes={nodes}
        selection={{ path: null, onSelect: noop }}
        collapsed={new Set()}
        onToggleDir={noop}
        flat
        testId="tree"
      />,
    );

    const tree = screen.getByTestId('tree');
    // The biggest change first — `flattenBySize`'s own ordering, restated
    // here only as the precondition the full-path assertion below reads off.
    const rows = within(tree).getAllByRole('button');
    expect(rows[0]?.getAttribute('aria-label')).toBe('z/huge.lock');
    // Full path as the VISIBLE text too, not just the accessible name — tree
    // mode would show "huge.lock" alone, which is ambiguous the moment two
    // files share a leaf name.
    expect(rows[0]?.textContent).toContain('z/huge.lock');
    expect(rows[0]?.textContent).not.toBe('huge.lock');
  });

  it('applies cascade classes and custom properties when cascading is active', () => {
    const nodes = buildChangeTree([file('src/a.ts'), file('src/b.ts')]);
    render(
      <ChangeTree
        nodes={nodes}
        selection={{ path: null, onSelect: noop }}
        collapsed={new Set()}
        onToggleDir={noop}
        cascading
        cascadeStyleFor={(i) => ({ '--i': i }) as React.CSSProperties}
        testId="tree"
      />,
    );

    const tree = screen.getByTestId('tree');
    // Top-level directory row
    const dirDiv = tree.querySelector('.group.flex.items-center');
    expect(dirDiv?.className).toContain('animate-fade-in-up');
    expect(dirDiv?.className).toContain('cascade-delay');
    expect(dirDiv?.getAttribute('style')).toContain('--i: 0');

    // Child file row
    const fileItem = within(tree).getByRole('button', { name: 'src/a.ts' }).closest('li');
    expect(fileItem?.className).toContain('animate-fade-in-up');
    expect(fileItem?.className).toContain('cascade-delay');
  });
});

describe('ChangeTotals', () => {
  it('formats file counts and line diffs with comma separators', () => {
    render(<ChangeTotals fileCount={1450} insertions={12000} deletions={4500} />);
    expect(screen.getByText('1,450 files')).not.toBeNull();
    expect(screen.getByText('+12,000')).not.toBeNull();
    expect(screen.getByText('−4,500')).not.toBeNull();
  });

  it('renders diff totals in a bold container aligned across the header', () => {
    const { container } = render(<ChangeTotals fileCount={2} insertions={10} deletions={5} />);
    const totals = container.querySelector('[data-testid="change-totals"]');
    expect(totals?.className).toContain('justify-between');
    const boldWrapper = container.querySelector('.font-bold');
    expect(boldWrapper).not.toBeNull();
    expect(boldWrapper?.textContent).toContain('+10');
    expect(boldWrapper?.textContent).toContain('−5');
  });

  it('shrinks and truncates instead of forcing its row to overflow', () => {
    const { container } = render(
      <ChangeTotals fileCount={145_000} insertions={12_345_678} deletions={9_876_543} />,
    );
    const totals = container.querySelector('[data-testid="change-totals"]');
    expect(totals?.className).toContain('min-w-0');
    expect(totals?.className).toContain('flex-1');
    expect(totals?.className).not.toContain('w-full');
    const fileCountLabel = screen.getByText('145,000 files');
    expect(fileCountLabel.className).toContain('truncate');
  });
});
