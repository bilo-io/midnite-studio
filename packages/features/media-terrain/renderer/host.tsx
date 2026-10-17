import type { IconComponent } from '@midnite/studio-frame';
import type { ImageProviderId } from '@midnite/studio-shared';
import { createContext, useContext, type ComponentType, type ReactNode, type RefObject } from 'react';

/**
 * The Terrain feature's host port (Phase 113 Theme S) — what Terrain needs from the app that composes it,
 * beyond the frame and the media kit.
 *
 * Three things differ per app: the "Show on map" hand-off (Terrain may not import the Maps feature, so the
 * app posts the request to Maps and brings its tab up), the app's modal and icon dropdown (Studio's own
 * chrome, with its dismiss stack), and the heightmap prompt dialog, which is made of Images' provider picker
 * and preferences — Studio's adapter is `packages/app/src/compose/media-terrain-host.tsx`. Everything is
 * optional: an app that leaves a seam out gets plain chrome and no prompt option, never an error.
 */

/** A capture-made terrain asking Maps to frame the square it came from. */
export type TerrainMapFocus = { project: string; name: string; center: [number, number]; sideM: number };

export type TerrainModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  role?: 'dialog' | 'alertdialog';
  initialFocusRef?: RefObject<HTMLElement | null>;
  testId?: string;
  children: ReactNode;
};

export type TerrainSelectOption = {
  value: string;
  label: string;
  icon: IconComponent;
  description?: string;
  disabled?: boolean;
};

export type TerrainSelectProps = {
  options: readonly TerrainSelectOption[];
  value: string;
  onChange: (next: string) => void;
  icon: IconComponent;
  label: string;
  description?: string;
};

export type HeightmapPromptDialogProps = {
  open: boolean;
  busy: boolean;
  error: string | null;
  onSubmit: (req: { prompt: string; provider: ImageProviderId; model: string }) => void;
  onCancel: () => void;
};

export type TerrainChrome = {
  Modal: ComponentType<TerrainModalProps>;
  /** A compact dropdown with an icon trigger (camera projection, shading). */
  Select: ComponentType<TerrainSelectProps>;
};

export type TerrainHost = {
  /** "Show on map": posts the request to Maps and brings it up. Absent → the button is not offered. */
  showOnMap?: (request: TerrainMapFocus) => void;
  /** Describe-the-ground → an Images provider → a heightmap. Absent → "Generate from a prompt" is not offered. */
  HeightmapPromptDialog?: ComponentType<HeightmapPromptDialogProps>;
  chrome?: Partial<TerrainChrome>;
};

const TerrainHostContext = createContext<TerrainHost>({});

export function TerrainHostProvider({ host, children }: { host: TerrainHost; children: ReactNode }) {
  return <TerrainHostContext.Provider value={host}>{children}</TerrainHostContext.Provider>;
}

/** The installed host, or an empty one outside a provider (Terrain works with the plain defaults). */
export function useTerrainHost(): TerrainHost {
  return useContext(TerrainHostContext);
}
