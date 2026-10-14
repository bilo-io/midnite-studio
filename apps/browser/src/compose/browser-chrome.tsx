import type { ConfirmRequest, FrameChrome, FrameDialogs, IconButtonProps } from '@midnite/studio-frame';

function IconButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  disabledReason,
  className,
  ...rest
}: IconButtonProps & { className?: string; size?: string; variant?: string }) {
  const isDisabled = disabled || Boolean(disabledReason);
  return (
    <button
      type="button"
      aria-label={label}
      title={disabledReason ? `${label} (${disabledReason})` : label}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      onClick={isDisabled ? undefined : onClick}
      className={`inline-flex items-center justify-center rounded p-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        isDisabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-neutral-800 text-neutral-300 hover:text-white'
      } ${className ?? ''}`}
      {...rest}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
}) {
  if (!request) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="alertdialog">
      <div className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-white">{request.title}</h3>
        {request.body && <p className="mt-2 text-sm text-neutral-400">{request.body}</p>}
        <div className="mt-6 flex justify-end gap-3">
          {!request.hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-800"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={request.onConfirm}
            className={`rounded px-4 py-2 text-sm font-medium text-white ${
              request.danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function useDialogs(): FrameDialogs {
  return {
    confirm: (request: ConfirmRequest) => {
      request.onConfirm();
    },
    notify: () => {},
    setBlastRadius: () => {},
    close: () => {},
  };
}

function PageDetachMark({ role, className }: { role: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border border-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400 ${className ?? ''}`}
      title={`Detached role: ${role}`}
    >
      Detached
    </span>
  );
}

export const BROWSER_CHROME: FrameChrome = {
  IconButton,
  ConfirmDialog,
  useDialogs,
  PageDetachMark,
};
