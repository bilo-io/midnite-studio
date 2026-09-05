import { useState, useEffect, useRef, type FormEvent } from 'react';
import { LuChevronDown, LuChevronUp, LuX } from 'react-icons/lu';
import { bridge } from '../../services/bridge';
import { useBrowserStore } from '../../store/browser-store';

export function FindBar({ onClose }: { onClose: () => void }) {
  const activeTabId = useBrowserStore((s) => s.activeTabId);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleFind = (forward = true) => {
    if (!activeTabId || !text.trim()) return;
    bridge()?.browser.find({ tabId: activeTabId, text, forward });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleFind(true);
  };

  const handleClose = () => {
    if (activeTabId) {
      bridge()?.browser.findStop({ tabId: activeTabId });
    }
    onClose();
  };

  return (
    <div
      data-testid="browser-find-bar"
      className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between border-t border-border bg-card/95 px-3 py-1.5 backdrop-blur-xs shadow-md animate-in slide-in-from-bottom-2 duration-150"
    >
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (activeTabId && e.target.value.trim()) {
              bridge()?.browser.find({ tabId: activeTabId, text: e.target.value, forward: true });
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Escape on a focused input belongs to that input and stops
              // there — the last of the four element-scoped handlers that was
              // still letting it bubble on to `window`, where it would also
              // close the browser pane the find bar sits in. Deliberately NOT
              // migrated to `useDismiss`: this dismissal IS a property of what
              // has focus.
              e.stopPropagation();
              handleClose();
            }
          }}
          placeholder="Find in page..."
          className="w-48 rounded border border-border bg-background px-2 py-0.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
        <button
          type="button"
          onClick={() => handleFind(false)}
          aria-label="Previous match"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleFind(true)}
          aria-label="Next match"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LuChevronDown className="h-3.5 w-3.5" />
        </button>
      </form>

      <button
        type="button"
        onClick={handleClose}
        aria-label="Close find bar"
        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <LuX className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
