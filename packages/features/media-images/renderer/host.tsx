import type { ImageProviderId, ImageProviderStatus } from '@midnite/studio-shared';
import { createContext, useContext, type ComponentType, type Dispatch, type ReactNode, type RefObject } from 'react';

import type { CreateAction, CreateState } from './create-panel-state';

/**
 * The Images feature's host port (Phase 113 Theme Q) — what Images needs from
 * the app that composes it, beyond the frame and the media kit.
 *
 * Studio's create panel is built on its ai-thread composer, provider picker
 * and voice; its lightbox joins Studio's dismiss stack (so a browser pane
 * under it hides) and focus trap; and "All images in repo" reads Studio's
 * repository file list. None of that may be imported by a feature, so each
 * is a seam: Studio's adapter is `packages/app/src/compose/media-images-host.tsx`.
 * An app that leaves `CreatePanel` out gets the feature's plain form.
 *
 * Provider keys never cross this port: generation runs in main, which reads
 * them from the vault, and the renderer only ever learns whether one is set.
 */
export type ImageCreatePanelProps = {
  state: CreateState;
  dispatch: Dispatch<CreateAction>;
  statuses: readonly ImageProviderStatus[];
  running: boolean;
  error: string | null;
  onGenerate: () => void;
  onCancel: () => void;
  /** Fired after the picker changes provider/model, e.g. to remember it as the default. */
  onPick?: (provider: ImageProviderId, model: string) => void;
};

export type ImagesHost = {
  /** The right pane's composer. Absent → the feature's plain create form. */
  CreatePanel?: ComponentType<ImageCreatePanelProps>;
  /**
   * Makes the lightbox modal: Escape closes it, focus stays inside. Studio's
   * also registers it as an occluder. A hook, called once per open lightbox.
   */
  useModal: (ref: RefObject<HTMLElement | null>, onClose: () => void) => void;
  /**
   * Every image path in the repository (for "All images in repo"), or
   * undefined while loading. A hook. Absent → the toggle is not offered.
   */
  useRepoImagePaths?: (repoId: string, enabled: boolean) => readonly string[] | undefined;
};

const ImagesHostContext = createContext<ImagesHost | null>(null);

export function ImagesHostProvider({ host, children }: { host: ImagesHost; children: ReactNode }) {
  return <ImagesHostContext.Provider value={host}>{children}</ImagesHostContext.Provider>;
}

/** The installed host. Throws without a provider — unwired, the lightbox could not close itself. */
export function useImagesHost(): ImagesHost {
  const host = useContext(ImagesHostContext);
  if (!host) throw new Error('The Images tab must be rendered inside <ImagesHostProvider>');
  return host;
}
