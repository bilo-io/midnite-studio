/**
 * The commit heatmap's colour ramp.
 *
 * A **data** colour, not a semantic one — the rule `metric-palette.ts` and
 * `lane-colors.ts` both state. A busy day is not a success and a quiet one is
 * not a warning, so borrowing `--success` or `--destructive` would tell the
 * reader something the data does not say.
 *
 * The reason a general token cannot serve is stronger here than usual, and is
 * worth writing down. `--primary` in this theme is a near-black in light mode
 * and a near-white in dark — the same observation Phase 19 Theme A recorded
 * about the sidebar's filter toggle. A near-neutral is perfectly good ink and
 * perfectly useless as a ramp: five alphas of it produce five greys, and a
 * heatmap whose entire job is to make "more" *look* like more becomes a field
 * of noise. That cue is not styling, it is the widget's only content.
 *
 * The four steps are defined as HSL triples in `styles.css` with a `.dark`
 * override, exactly as `--health-warn` and `--lane-ink-l` are — so the theme
 * swap happens in CSS, at the point of use, and no component has to ask which
 * theme is on.
 */

/** Level 0 has no colour of its own — it takes `--muted`, the empty-cell ground. */
export type CalendarLevel = 0 | 1 | 2 | 3 | 4;

/** The fill for one cell. Level 0 is the muted ground, not a pale green. */
export const calendarColor = (level: CalendarLevel): string =>
  level === 0 ? 'hsl(var(--muted))' : `hsl(var(--cal-${level}))`;
