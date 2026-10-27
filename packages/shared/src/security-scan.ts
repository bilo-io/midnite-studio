import { z } from 'zod';

/**
 * `security.scanContent` (Phase 121 Theme A): the injection detector's answer, over IPC.
 *
 * The detector is pure and lives in the runtime (main-only), so a renderer that wants to put a
 * banner on a draft attachment asks main. The response carries the labelled signals the banner
 * names, whether the score crossed the threshold, and, only when it did, the text with the flagged
 * runs cut out, so "strip the flagged runs" is one click and no second round trip.
 */

export const SecurityScanContentRequest = z.object({ text: z.string().max(400_000) });
export type SecurityScanContentRequest = z.infer<typeof SecurityScanContentRequest>;

export const SecurityScanSignalSchema = z.object({ id: z.string().min(1).max(64), weight: z.number().min(0).max(1) });
export type SecurityScanSignal = z.infer<typeof SecurityScanSignalSchema>;

export const SecurityScanContentResponse = z.object({
  score: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  flagged: z.boolean(),
  signals: z.array(SecurityScanSignalSchema),
  /** The text with every flagged run removed. Present only when `flagged`. */
  stripped: z.string().optional(),
});
export type SecurityScanContentResponse = z.infer<typeof SecurityScanContentResponse>;

/** Human names for the detector's signal ids, what the banner lists. */
export const INJECTION_SIGNAL_LABELS: Readonly<Record<string, string>> = {
  'unicode-tag-characters': 'invisible Unicode tag characters',
  'invisible-controls': 'zero-width or direction-control characters',
  'html-comment': 'an HTML comment',
  'hidden-span': 'hidden markup',
  'base64-run': 'a long base64 run',
  'addressed-to-model': 'instructions addressed to the assistant',
  'role-marker': 'chat role markers',
  'tool-call-shape': 'a tool-call shape',
  'url-credentials': 'a URL carrying credentials',
};

export function injectionSignalLabel(id: string): string {
  return INJECTION_SIGNAL_LABELS[id] ?? id;
}
