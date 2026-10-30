import { useFrameChrome, type FrameDialogs, type IconButtonProps } from '@midnite/studio-frame';

import { useLoopsHost, type LoopsExtrasComposerProps, type LoopsIconSelectProps, type LoopsMultiIconSelectProps, type LoopsTooltipProps } from './host';

/*
  The app's chrome, reached through the host. Each is a component that reads
  the slot at render, rather than a slot destructured into a local component
  inside another one — a component created during render remounts every time.
*/

export function Tooltip(props: LoopsTooltipProps) {
  const { Tooltip: Slot } = useLoopsHost();
  return <Slot {...props} />;
}

export function IconSelect(props: LoopsIconSelectProps) {
  const { IconSelect: Slot } = useLoopsHost();
  return <Slot {...props} />;
}

export function MultiIconSelect(props: LoopsMultiIconSelectProps) {
  const { MultiIconSelect: Slot } = useLoopsHost();
  return <Slot {...props} />;
}

export function ExtrasComposer(props: LoopsExtrasComposerProps) {
  const { ExtrasComposer: Slot } = useLoopsHost();
  return <Slot {...props} />;
}

export function IconButton(props: IconButtonProps) {
  const { IconButton: Slot } = useFrameChrome();
  return <Slot {...props} />;
}

export function useDialogs(): FrameDialogs {
  return useFrameChrome().useDialogs();
}
