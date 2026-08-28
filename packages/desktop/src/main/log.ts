/**
 * The main process's one log seam.
 *
 * Main has no logger today — every file that wants one (`metrics/gpu.ts`) has
 * been rolling its own `console.warn` default parameter. This is that pattern
 * lifted out so the render-process-gone handler and, later, the Phase 30
 * Theme C broker client can share one place: Theme C's own log line
 * (`[broker] …`) redirects this seam to `<userData>/broker/<version>.log`
 * rather than introducing a second one.
 */
export type Logger = (message: string) => void;

// eslint-disable-next-line no-console
export const defaultLogger: Logger = (message) => console.warn(message);
