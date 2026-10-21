import { z } from 'zod';

/**
 * Matched reference views (Phase 104 Theme H). A reference picture is only useful for sculpting once it is
 * *registered* to the model: an orthographic front, side or top camera with a scale and an offset, so a pixel of
 * the picture and a point of the model line up. They are saved on the design (`ModelSpec.referenceViews`), so the
 * user and the agent share one alignment.
 *
 * The camera is the preview's own convention (`camera.ts`): the picture's pixel `(0, 0)` is its top-left corner,
 * `x` runs right and `y` down, and the model's origin lands at `offset` (in picture pixels).
 */
export const REFERENCE_VIEW_NAMES = ['front', 'side', 'top'] as const;
export const ReferenceViewNameSchema = z.enum(REFERENCE_VIEW_NAMES);
export type ReferenceViewName = z.infer<typeof ReferenceViewNameSchema>;

export const ReferenceViewSchema = z.object({
  view: ReferenceViewNameSchema,
  /** Picture pixels per model unit (metre). */
  scale: z.number().positive().max(100_000),
  /** Where the model's origin falls in the picture, in pixels from its top-left corner. */
  offset: z.tuple([z.number().min(-100_000).max(100_000), z.number().min(-100_000).max(100_000)]),
  /**
   * The picture this view is matched to: a file beside the design (`<stem>.ref.side.png`). Absent = the design's
   * own reference picture, which is how a single front photo is used.
   */
  image: z
    .string()
    .min(1)
    .max(200)
    .refine((v) => !v.includes('/') && !v.includes('\\') && !v.startsWith('.'), 'a file name beside the design')
    .optional(),
});
export type ReferenceView = z.infer<typeof ReferenceViewSchema>;

export const ReferenceViewsSchema = z
  .array(ReferenceViewSchema)
  .min(1)
  .max(3)
  .refine((views) => new Set(views.map((v) => v.view)).size === views.length, 'one entry per view');
export type ReferenceViews = z.infer<typeof ReferenceViewsSchema>;

/** Passes an iterative run gets for the 1–100 refinement slider; one pass per slider step is far too many, so it scales. */
export const referencePassBudget = (refinement: number): number => Math.max(1, Math.min(12, Math.round(refinement)));
