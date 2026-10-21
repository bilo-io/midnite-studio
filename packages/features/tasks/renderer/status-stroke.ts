import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';

import { fieldOptionColor } from './field-option-colors';

/**
 * A task's status stroke: the one table that decides how a status looks on a
 * card's border and on the dependency edge leading out of that card to the
 * task it blocks. The board card, the graph node and the graph edge all read
 * it, so a card and its edge can never disagree.
 *
 * The colour is the status option's own colour (the same one its column and
 * its chip wear). The table only sets the pattern per status kind.
 *
 * `dashArray` is an SVG `stroke-dasharray` string, in px, used as-is by the
 * edge's `<path>` and by the `<rect>` drawn over a card's border. A card is
 * an HTML element, and `border-style: dashed` cannot be animated, so the
 * dashed border is an SVG rect sized to the card. That lets the border and
 * the edge share one dash definition and one keyframe. Each period
 * (dash + gap) divides 20, the distance the shared `status-stroke-dash`
 * keyframe moves the offset, so every pattern loops without a jump.
 */
export type StatusKind = 'todo' | 'inProgress' | 'inReview' | 'done' | 'other';

export interface StatusStrokeSpec {
  /** `null` = a solid line. */
  dashArray: string | null;
  /** Marching-ants motion. Only ever set on a dashed pattern. */
  animated: boolean;
}

export const STATUS_STROKE_TABLE: Readonly<Record<StatusKind, StatusStrokeSpec>> = {
  todo: { dashArray: '6 4', animated: true },
  inProgress: { dashArray: '14 6', animated: true },
  inReview: { dashArray: '6 4', animated: true },
  done: { dashArray: null, animated: false },
  other: { dashArray: null, animated: false },
};

/** Card border width and edge stroke width, in px, for every status. */
export const STATUS_STROKE_WIDTH = 2;

/**
 * Stroke opacity of a blocked task's border (and of the edge leading out of
 * it). Low enough that a blocked card reads as "not yet" at a glance, high
 * enough that its status colour still names the column it sits in.
 */
export const STATUS_STROKE_BLOCKED_OPACITY = 0.55;

export interface StatusStroke extends StatusStrokeSpec {
  kind: StatusKind;
  /** A hex colour, from `fieldOptionColor`. */
  color: string;
  width: number;
  /**
   * At least one blocker is still open (`ForgeGraphNode.blocked`, from
   * `resolveForgeGraph`). A blocked stroke keeps its status colour and dash
   * pattern but never marches, and is drawn at `opacity`.
   */
  blocked: boolean;
  /** SVG `stroke-opacity`: 1, or `STATUS_STROKE_BLOCKED_OPACITY` when blocked. */
  opacity: number;
}

/** Status names, upper-cased and space-collapsed, per kind. Anything else is `other`. */
const KIND_BY_NAME: Readonly<Record<string, StatusKind>> = {
  TODO: 'todo',
  'TO DO': 'todo',
  'IN PROGRESS': 'inProgress',
  PROGRESS: 'inProgress',
  DOING: 'inProgress',
  WIP: 'inProgress',
  'IN REVIEW': 'inReview',
  REVIEW: 'inReview',
  DONE: 'done',
  CLOSED: 'done',
  COMPLETE: 'done',
  COMPLETED: 'done',
  SHIPPED: 'done',
};

export function statusKind(name: string): StatusKind {
  const key = name.trim().toUpperCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return KIND_BY_NAME[key] ?? 'other';
}

/**
 * The stroke for a status option, given its name and GitHub colour (`''` when
 * none was sent). `blocked` holds the pattern still and fades it: waiting on
 * another task is not progress, so nothing on it should move.
 */
export function statusStroke(name: string, color: string, blocked = false): StatusStroke {
  const kind = statusKind(name);
  const spec = STATUS_STROKE_TABLE[kind];
  return {
    kind,
    dashArray: spec.dashArray,
    animated: spec.animated && !blocked,
    // Same fallback the chips use: an option with no colour resolves by name.
    color: fieldOptionColor(color || name),
    width: STATUS_STROKE_WIDTH,
    blocked,
    opacity: blocked ? STATUS_STROKE_BLOCKED_OPACITY : 1,
  };
}

/** The board's Status field: a single-select named `Status` (case-insensitive), or `null`. */
export function findStatusField(fields: readonly ForgeProjectField[]): ForgeProjectField | null {
  return (
    fields.find((f) => f.dataType === 'single_select' && f.name === 'Status') ??
    fields.find(
      (f) => f.dataType === 'single_select' && f.name.trim().toLowerCase() === 'status',
    ) ??
    null
  );
}

/**
 * An item's status stroke, or `null` when the board has no Status field or
 * the item has no value in it. Read from the item's own Status value, not its
 * column, so it holds whatever field the board is grouped by. The option's
 * colour comes from the field's current option list; a value whose option has
 * since been deleted still resolves, by its set-time name.
 *
 * `blocked` comes from the caller's `blockedItemIds(graph)` (graph-blockers.ts),
 * the one blocked derivation every view shares.
 */
export function itemStatusStroke(
  item: ForgeProjectItem | undefined,
  statusField: ForgeProjectField | null,
  blocked = false,
): StatusStroke | null {
  if (!item || !statusField || statusField.dataType !== 'single_select') return null;
  const value = item.fieldValues[statusField.id];
  if (value?.dataType !== 'single_select') return null;
  const option = statusField.options.find((o) => o.id === value.optionId);
  const name = option?.name ?? value.name;
  if (!name) return null;
  return statusStroke(name, option?.color ?? '', blocked);
}
