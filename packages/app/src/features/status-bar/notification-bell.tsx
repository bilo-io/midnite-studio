import { useState } from 'react';
import { LuBell } from 'react-icons/lu';

import type { ActivityStatus } from '@midnite/studio-shared';

import { Popover } from '../../components/popover';
import { useToastStore, type ToastStatus } from '../../store/toast-store';
import { activityStatusVar } from '../activity/activity-status-color';

/**
 * A toast's own severity, mapped onto the shared {@link ActivityStatus}
 * vocabulary (Phase 95 Theme A) — `info`/`success`/`warning`/`error` are a
 * *severity* axis, not a run-state one, but the closest activity colour for
 * each keeps this bell's palette in step with every other status pill:
 * `info` → `running` (the same blue as "in progress"), `warning` → `waiting`
 * (the app's one existing amber), `error` → `failed` (the same red
 * `--destructive` every other failure uses).
 */
const STATUS_TO_ACTIVITY: Record<ToastStatus, ActivityStatus> = {
  info: 'running',
  success: 'done',
  warning: 'waiting',
  error: 'failed',
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const toasts = useToastStore((s) => s.toasts);
  const unreadCount = toasts.length;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="end"
      label="Notifications"
      testId="notification-bell"
      panelClassName="w-[300px] max-h-[400px] overflow-y-auto p-2"
      trigger={
        <div className="relative flex items-center">
          <LuBell aria-hidden className="h-3.5 w-3.5" />
          {unreadCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[9px] text-white">
              {unreadCount}
            </span>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 border-b border-border pb-2 text-xs font-semibold text-foreground">
          <LuBell aria-hidden className="h-3.5 w-3.5" />
          <span>Notifications</span>
        </div>
        {toasts.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          toasts.map((toast) => (
            <div
              key={toast.id}
              className="rounded border border-border bg-card p-3 text-sm shadow-sm"
              style={{ color: activityStatusVar(STATUS_TO_ACTIVITY[toast.status]) }}
            >
              {toast.message}
              {/*
                An actionable notification gets a button rather than becoming
                one: the row is also a place to read, and a whole-row click
                target makes dismissing the popover by clicking near a message
                do something instead.
              */}
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    toast.action?.onAction();
                  }}
                  className="mt-2 block rounded-md border border-border px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                >
                  {toast.action.label}
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Popover>
  );
}
