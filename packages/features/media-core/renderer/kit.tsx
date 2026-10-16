import type { MediaAccordionProps, MediaKit } from '@midnite/studio-frame';

import { ExportToolbar } from './export-toolbar';
import { useMediaHost } from './host';
import { MediaLayout, useOpenMediaPane } from './media-layout';
import { useMediaOpenFor, useMediaOpenRequest } from './media-open-request';
import { MediaProjectsAccordion } from './media-projects-accordion';
import { NoRepoMediaState } from './repo-media-tab';
import {
  MEDIA_KEYS,
  revealMedia,
  useMediaExport,
  useMediaFiles,
  useMediaFileText,
  useMediaMutations,
  useMediaProjects,
} from './use-media';

/** The app's explorer accordion, through the host — a tab feature reaches it as `kit.Accordion`. */
function HostAccordion(props: MediaAccordionProps) {
  const { Accordion } = useMediaHost();
  return <Accordion {...props} />;
}

function useMediaRepoId(): string | null {
  return useMediaHost().useRepoId();
}

function useMediaExportDir(): string | null {
  return useMediaHost().useExportDir();
}

function clearMediaOpenRequest(): void {
  useMediaOpenRequest.getState().clear();
}

/**
 * media-core's implementation of the frame's media kit port (Phase 113
 * Theme Q). `MediaShell` installs it around the tabs it renders; a tab
 * feature reads it with the frame's `useMediaKit()`, never by importing this
 * package. `satisfies` holds every member to the port's declared shape.
 */
export const mediaKit = {
  MediaLayout,
  MediaProjectsAccordion,
  NoRepoMediaState,
  ExportToolbar,
  Accordion: HostAccordion,
  keys: MEDIA_KEYS,
  useMediaProjects,
  useMediaFiles,
  useMediaFileText,
  useMediaMutations,
  useMediaExport,
  revealMedia,
  useOpenMediaPane,
  useMediaOpenFor,
  clearMediaOpenRequest,
  useMediaRepoId,
  useMediaExportDir,
} as const satisfies MediaKit;
