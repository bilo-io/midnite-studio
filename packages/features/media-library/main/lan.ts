/**
 * The LAN streaming seam (Phase 113 Theme R — deferred to slice R2, with ffmpeg transcoding).
 *
 * Slice 1 opens **no listening socket**: playback is local, through the `mstudio-file:` scheme, and a
 * file the platform's media stack cannot decode simply does not play. R2 fills this seam — a server the
 * user starts, bound to the LAN only, serving the same jailed paths `LibraryService.resolveFile` serves
 * now, with a transcoder for what Chromium cannot play. Until then the composer wires
 * {@link NO_LAN_STREAMING}, and nothing in the library listens.
 */
export type LibraryStreamServer = {
  /** Whether a server can be started in this build. */
  available: boolean;
  /** Starts serving on the LAN; resolves to the URL other devices open. */
  start: () => Promise<{ url: string } | null>;
  stop: () => Promise<void>;
};

export const NO_LAN_STREAMING: LibraryStreamServer = {
  available: false,
  start: async () => null,
  stop: async () => undefined,
};
