import {
  DEFAULT_LIBRARY_LAN_SETTINGS,
  failure,
  type GitOpResult,
  type LibraryFfmpegStatus,
  type LibraryLanSettingsPatch,
  type LibraryLanStatus,
} from '@midnite/studio-shared';

/**
 * Sharing the library on the local network (Phase 113 Theme R slice 2) — the controller the IPC handlers drive.
 * `createLanStreamServer` (`lan-server.ts`) is the real one: a server the user starts, bound to one private
 * address they picked, serving only what `LibraryService.resolveFile` resolves, behind an access token. A
 * composer that wires none passes {@link NO_LAN_STREAMING}, and nothing in the library listens.
 */
export type LibraryLanController = {
  /** Whether a server can be started in this build. */
  available: boolean;
  status: () => Promise<LibraryLanStatus>;
  /** Binds `address` (or the saved one); refused unless it is one of this computer's private IPv4 addresses. */
  start: (address?: string) => Promise<GitOpResult<LibraryLanStatus>>;
  /** The user's Stop: closes the server and forgets that it was on. */
  stop: () => Promise<GitOpResult>;
  /** A new token: every link handed out before stops working, and open streams are cut. */
  regenerateToken: () => Promise<GitOpResult>;
  setSettings: (patch: LibraryLanSettingsPatch) => Promise<GitOpResult>;
  /** Looks for ffmpeg again (after the user installed it, or changed its path). */
  detectFfmpeg: () => Promise<LibraryFfmpegStatus>;
  /**
   * Opens main's own file dialog to pick an ffmpeg. Cancelled: the current status, unchanged. A pick is saved only
   * when it is an absolute path to an executable file named `ffmpeg`; the renderer never names the binary.
   */
  chooseFfmpeg: () => Promise<GitOpResult<LibraryFfmpegStatus>>;
  /** At launch: starts only when the user left it on *and* switched on "start with the app". */
  startAtLaunch: () => Promise<void>;
  /** On quit: closes everything, remembering that it was on. */
  dispose: () => Promise<void>;
};

const UNAVAILABLE = 'Sharing on the network is not available in this build.';
const NO_FFMPEG: LibraryFfmpegStatus = {
  found: false,
  path: null,
  source: null,
  reason: UNAVAILABLE,
};

export const NO_LAN_STREAMING: LibraryLanController = {
  available: false,
  status: async () => ({
    available: false,
    running: false,
    url: null,
    settings: { ...DEFAULT_LIBRARY_LAN_SETTINGS },
    interfaces: [],
    clients: [],
    transcodes: 0,
    ffmpeg: NO_FFMPEG,
  }),
  start: async () => failure(UNAVAILABLE),
  stop: async () => failure(UNAVAILABLE),
  regenerateToken: async () => failure(UNAVAILABLE),
  setSettings: async () => failure(UNAVAILABLE),
  detectFfmpeg: async () => NO_FFMPEG,
  chooseFfmpeg: async () => failure(UNAVAILABLE),
  startAtLaunch: async () => undefined,
  dispose: async () => undefined,
};
