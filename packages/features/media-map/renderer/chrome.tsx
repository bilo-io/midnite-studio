import { useFrameChrome, type FrameDialogs, type IconButtonProps } from '@midnite/studio-frame';

/**
 * The frame chrome Maps draws with (Phase 113 Theme S), reached through the frame's chrome port so the
 * app that composes the feature supplies its own `IconButton` and dialogs. These two thin wrappers keep
 * every call site reading the way it did when the components were imported from the app.
 */
export function IconButton(props: IconButtonProps) {
  const { IconButton: Impl } = useFrameChrome();
  return <Impl {...props} />;
}

/** The app's confirm/prompt/menu dialogs. A hook, like `useDialogs` always was. */
export function useDialogs(): FrameDialogs {
  return useFrameChrome().useDialogs();
}
