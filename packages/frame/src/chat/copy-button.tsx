import { useEffect, useRef, useState } from 'react';
import { LuCheck, LuCopy } from 'react-icons/lu';

import { useFrameChrome } from '../chrome/chrome-port';
import { useToastStore } from '../toast-store';

/**
 * Copy-to-clipboard for a message in an AI thread — Chats' reply actions and
 * Councils' member and synthesis turns (moved down from Chats in Phase 133).
 */

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    useToastStore.getState().addToast({ message: 'Could not copy to the clipboard.', status: 'error' });
    return false;
  }
}

/** An icon button that copies `text` and shows a check for a moment. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { IconButton } = useFrameChrome();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current !== null && clearTimeout(timer.current)), []);
  return (
    <IconButton
      icon={copied ? LuCheck : LuCopy}
      label={copied ? 'Copied' : label}
      size="sm"
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return;
          setCopied(true);
          timer.current = setTimeout(() => setCopied(false), 1500);
        });
      }}
    />
  );
}
