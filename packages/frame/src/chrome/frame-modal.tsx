import { KitModal } from '../kit/kit-modal';
import { useOptionalFrameChrome } from './chrome-port';
import type { FrameModalProps } from './types';

/**
 * The modal a feature renders: the composing app's own (`FrameChrome.Modal`) when it installed one,
 * the kit's `KitModal` otherwise — so a feature dialog works in every app without each app having
 * to supply a modal first.
 */
export function FrameModal(props: FrameModalProps) {
  const Modal = useOptionalFrameChrome()?.Modal ?? KitModal;
  return <Modal {...props} />;
}
