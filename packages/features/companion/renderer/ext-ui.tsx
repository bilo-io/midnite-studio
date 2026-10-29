import type { ComponentProps } from 'react';

import { useFrameChrome, type IconButtonProps } from '@midnite/studio-frame';

import { getCompanionHost, useCompanionHost, type CompanionHost, type CompanionPillKey } from './host';

/**
 * The chrome the companion draws, resolved through the installed port on each render (Phase 123
 * Theme F) — the same wrapper shape Chats' `ui.tsx` uses. The moved files kept their JSX and swapped
 * only the import path; the implementation is whichever the composing app installed.
 */

export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export function ConfirmDialog(props: ComponentProps<ReturnType<typeof useFrameChrome>['ConfirmDialog']>) {
  const { ConfirmDialog: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

export const useDialogs = () => useFrameChrome().useDialogs();

type Components = CompanionHost['components'];

export function Tooltip(props: ComponentProps<Components['Tooltip']>) {
  const { Tooltip: Impl } = useCompanionHost().components;
  return <Impl {...props} />;
}

export function UserAvatar(props: ComponentProps<Components['UserAvatar']>) {
  const { UserAvatar: Impl } = useCompanionHost().components;
  return <Impl {...props} />;
}

export function ExternalLink(props: ComponentProps<Components['ExternalLink']>) {
  const { ExternalLink: Impl } = useCompanionHost().components;
  return <Impl {...props} />;
}

export function AiComposer(props: ComponentProps<Components['AiComposer']>) {
  const { AiComposer: Impl } = useCompanionHost().components;
  return <Impl {...props} />;
}

export function LevelMeterBars(props: ComponentProps<Components['LevelMeterBars']>) {
  const { LevelMeterBars: Impl } = useCompanionHost().components;
  return <Impl {...props} />;
}

export function AiThreadFrame(props: ComponentProps<Components['AiThreadFrame']>) {
  const { AiThreadFrame: Impl } = useCompanionHost().components;
  return <Impl {...props} />;
}

export function ThinkingIndicator(props: ComponentProps<Components['ThinkingIndicator']>) {
  const { ThinkingIndicator: Impl } = useCompanionHost().components;
  return <Impl {...props} />;
}

export function DialogHost(props: ComponentProps<Components['DialogHost']>) {
  const { DialogHost: Impl } = useCompanionHost().components;
  return <Impl {...props} />;
}

export const useComposerMic: CompanionHost['hooks']['useComposerMic'] = (options) =>
  getCompanionHost().hooks.useComposerMic(options);

export const useDismissable: CompanionHost['hooks']['useDismissable'] = (options) =>
  getCompanionHost().hooks.useDismissable(options);

export function LockScreenSysmonWidget() {
  const { SysmonWidget } = useCompanionHost().screensaver;
  return <SysmonWidget />;
}

export function LockScreenFintechWidget() {
  const { FintechWidget } = useCompanionHost().screensaver;
  return <FintechWidget />;
}

export function useScreensaverReading(): { counts: Record<CompanionPillKey, number> } {
  return { counts: useCompanionHost().screensaver.usePillCounts() };
}

export const applyPillDestination: CompanionHost['screensaver']['applyPillDestination'] = (key, actions) =>
  getCompanionHost().screensaver.applyPillDestination(key, actions);

export type PillKey = CompanionPillKey;
