import { LuBell, LuCamera, LuMapPin, LuMic, LuX } from 'react-icons/lu';

import { bridge } from '@midnite/studio-frame';
import type { BrowserPermissionKind } from '@midnite/studio-shared';

import { useBrowserStore, type BrowserPermissionRequest } from '../browser-store';
import { IconButton } from '../ui';

const PERMISSION_LABELS: Record<BrowserPermissionKind, string> = {
  camera: 'camera',
  microphone: 'microphone',
  geolocation: 'location',
  notifications: 'notifications',
};

function permissionIcon(kind: BrowserPermissionKind) {
  switch (kind) {
    case 'camera':
      return LuCamera;
    case 'microphone':
      return LuMic;
    case 'geolocation':
      return LuMapPin;
    case 'notifications':
      return LuBell;
  }
}

export function PermissionPromptBar() {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const prompt: BrowserPermissionRequest | undefined = useBrowserStore(
    (s) => (activeTabId ? s.pendingPermissionRequests[activeTabId] : undefined),
  );
  const clearPrompt = useBrowserStore((s) => s.clearPendingPermissionRequest);

  if (!prompt) return null;

  const Icon = permissionIcon(prompt.permission);
  const label = PERMISSION_LABELS[prompt.permission] ?? prompt.permission;

  const handleDecision = (decision: 'allow' | 'deny' | 'dismiss') => {
    bridge()?.browser.respondPermission({
      requestId: prompt.requestId,
      decision,
    });
    clearPrompt(prompt.tabId);
  };

  return (
    <div
      data-testid="browser-permission-bar"
      className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between border-b border-border bg-card/95 px-3 py-2 backdrop-blur-xs shadow-md animate-in slide-in-from-top-2 duration-150"
    >
      <div className="flex items-center gap-2 min-w-0 pr-3">
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate text-xs text-foreground">
          <strong className="font-semibold">{prompt.displayName}</strong> wants to use your {label}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => handleDecision('deny')}
          className="rounded border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Block
        </button>
        <button
          type="button"
          onClick={() => handleDecision('allow')}
          className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Allow
        </button>
        <IconButton
          icon={LuX}
          label="Dismiss"
          size="sm"
          onClick={() => handleDecision('dismiss')}
        />
      </div>
    </div>
  );
}
