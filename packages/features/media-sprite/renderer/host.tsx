import type {
  GitOpResult,
  ImageProviderId,
  ImageProviderStatus,
  ModelClip,
  ModelEngine,
  SpriteRenderFramesRequest,
  SpriteRenderRequestEvent,
} from '@midnite/studio-shared';
import { createContext, useContext, type ComponentType, type ReactNode } from 'react';

/**
 * The Sprite feature's host port (Phase 113 Theme S) — what Sprites needs from the app that composes it,
 * beyond the frame and the media kit.
 *
 * Sprites leans on three things the Model tab and Studio own: the AI prompt composer with its provider
 * picker (ai-thread), the Models library and engine preference (a rigged character to render from; who
 * writes a map's layout), and the three.js scene builder that turns a rig into frames. None may be
 * imported by a feature, so each is a seam; Studio's adapter is `packages/app/src/compose/media-sprite-host.tsx`.
 *
 * Everything is optional. An app that leaves a seam out gets the feature's plain version: a textarea and a
 * Generate button in place of the composer, no rigged models (so "Render from 3D" offers none), a default
 * Ollama engine for map layouts, and a render request answered with an error instead of frames.
 */

/** A Models asset a sheet can be rendered from: it has a rig and animations. */
export type RiggedModel = { project: string; path: string; label: string; clips: ModelClip[] };

/** One provider/model dropdown beside the prompt. The host draws it with its own provider rows. */
export type SpriteComposerPicker = {
  testId: string;
  statuses: readonly ImageProviderStatus[];
  /** A reason a provider cannot be picked for this form, or undefined. */
  blockedFor?: (provider: ImageProviderId) => string | null | undefined;
  provider: ImageProviderId;
  models: ReadonlyArray<{ id: string; label: string; recommended?: boolean }>;
  model: string;
  onProviderChange: (provider: ImageProviderId) => void;
  onModelChange: (model: string) => void;
};

export type SpriteComposerProps = {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  sendTooltip: string;
  sendAriaLabel: string;
  rows: number;
  dimmed: boolean;
  placeholder: string;
  testIdPrefix: string;
  /** Absent → no provider/model dropdown. */
  picker?: SpriteComposerPicker;
};

/** What the three.js render job needs from the app: reading the model's design file, and posting frames to main. */
export type SpriteRenderJobApi = {
  readText: (req: { repoId: string; project: string; path: string }) => Promise<string | null>;
  post: (req: SpriteRenderFramesRequest) => Promise<GitOpResult>;
};

export type SpriteRenderJobModule = {
  runRenderJob: (event: SpriteRenderRequestEvent, api: SpriteRenderJobApi) => Promise<void>;
};

export type SpriteHost = {
  /** The prompt box with its provider/model picker. Absent → a plain textarea with a Send button. */
  Composer?: ComponentType<SpriteComposerProps>;
  /** The Models assets a sheet can be rendered from. A hook; `repoId` is null when none is wanted. Absent → none. */
  useRiggedModels?: (repoId: string | null) => { models: readonly RiggedModel[]; loading: boolean };
  /** Who writes a map's layout (the Models tab's engine). A hook. Absent → Ollama with no model chosen. */
  useMapEngine?: () => { engine: ModelEngine; label: string };
  /** Loads the 3D render job (three.js, lazily). Absent → a render request is answered with an error. */
  loadRenderJob?: () => Promise<SpriteRenderJobModule>;
};

const SpriteHostContext = createContext<SpriteHost>({});

export function SpriteHostProvider({ host, children }: { host: SpriteHost; children: ReactNode }) {
  return <SpriteHostContext.Provider value={host}>{children}</SpriteHostContext.Provider>;
}

/** The installed host, or an empty one outside a provider — Sprites degrades to its plain version. */
export function useSpriteHost(): SpriteHost {
  return useContext(SpriteHostContext);
}

const NO_MODELS: readonly RiggedModel[] = [];
const noRigged = () => ({ models: NO_MODELS, loading: false });
const DEFAULT_ENGINE = { engine: { kind: 'ollama', model: '' } as ModelEngine, label: 'Ollama' };
const noEngine = () => DEFAULT_ENGINE;

/** The rigged models to render from — the host's, else none. */
export function useRiggedModels(repoId: string | null) {
  return (useSpriteHost().useRiggedModels ?? noRigged)(repoId);
}

/** The engine a map layout is written by — the host's, else a bare Ollama. */
export function useMapEngine(): { engine: ModelEngine; label: string } {
  return (useSpriteHost().useMapEngine ?? noEngine)();
}
