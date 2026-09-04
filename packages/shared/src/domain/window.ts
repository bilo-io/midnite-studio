import { z } from 'zod';

/**
 * Which auxiliary surface a secondary `BrowserWindow` hosts, or `main` for the
 * primary window. A popout's own renderer learns its role via `WINDOW_ROLE_ARG`
 * (see `ipc/channels.ts`) rather than a URL query string.
 */
export const WindowRoleSchema = z.enum(['main', 'terminal', 'repos', 'fab', 'browser']);
export type WindowRole = z.infer<typeof WindowRoleSchema>;

/** One open window, as the renderer needs to know it. */
export const WindowDescriptorSchema = z.object({
  /** Electron's `BrowserWindow.id`. */
  id: z.number().int(),
  role: WindowRoleSchema,
  repoId: z.string().nullable(),
});
export type WindowDescriptor = z.infer<typeof WindowDescriptorSchema>;
