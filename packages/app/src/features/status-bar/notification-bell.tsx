import { useState } from 'react';
import { LuBell } from 'react-icons/lu';

import { Popover } from '../../components/popover';
import { useToastStore, type ToastStatus } from '../../store/toast-store';

const STATUS_COLORS: Record<ToastStatus, string> = {
  info: 'text-blue-500',
  success: 'text-green-500',
  warning: 'text-yellow-500',
  error: 'text-red-500',
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
              className={`rounded border border-border bg-card p-3 text-sm shadow-sm ${STATUS_COLORS[toast.status]}`}
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
