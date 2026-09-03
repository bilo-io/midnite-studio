import { VersionPill } from './version-pill';

/**
 * The rail's bottom strip — the version pill, on a rule that lines up with the
 * status bar's.
 *
 * The alignment is the point, and it is not decorative. The rail is
 * `position: fixed` down the left edge and the status bar is the last row of
 * `<main>`, so the two meet at the window's bottom-left corner with nothing
 * joining them: a rule at any other height reads as two chrome edges that
 * *nearly* agree, which is worse than no rule at all. `h-6` is the status bar's
 * own height (`status-bar.tsx`), so the two hairlines are the same line, and the
 * only thing between them is the rail's own 1px right border.
 *
 * **Absolutely positioned, and that is what makes it exact.** In flow it would
 * sit inside `@bilo-io/shell`'s footer wrapper, which is `items-center` on a
 * collapsed rail — so the column is *content*-sized, and a row's `w-full`
 * resolves against a width the row is itself setting. A pill wider than the rail
 * then does not overflow the strip; it widens the whole column and pushes the
 * hairline out past the rail's border, several pixels beyond where the status
 * bar's begins. Stating a width instead only trades that for a rounding error,
 * because the aside's border eats a pixel the child cannot see.
 *
 * The rail's `position: fixed` makes it the containing block for this, so
 * `inset-x-0 bottom-0` resolves against the rail's padding box: the full width
 * between its borders, flush with the window's bottom edge, in both rail widths
 * and through the width transition between them. The cost is one line in
 * `app.tsx` — the footer stack pads itself by the 12px this strip claims beyond
 * the rail's own `py-3`, since an absolute box reserves no space of its own.
 */
export function RailVersion({ expanded }: { expanded: boolean }) {
  return (
    <div
      data-testid="rail-version"
      className={`absolute inset-x-0 bottom-0 flex h-6 items-center border-t border-border ${
        expanded ? 'justify-start px-2' : 'justify-center px-1'
      }`}
    >
      <VersionPill expanded={expanded} />
    </div>
  );
}
