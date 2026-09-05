import { useEffect, useState } from 'react';
import { LuServer } from 'react-icons/lu';

import { useUiStore } from '../../store/ui-store';
import { bridge, hasBridge } from '../../services/bridge';

/** How often this segment re-checks, while mounted — pull, not push, matching the Settings page's own call-log polling. */
const POLL_MS = 5000;

/**
 * A status-bar item for the MCP server (Phase 57 Theme F), visible only
 * while it is actually listening — `null` otherwise, the same idiom
 * `DiagnosticsSegment`/`MonitorCluster` already use for "nothing to report".
 */
export function McpIndicator() {
  const [running, setRunning] = useState(false);
  const setSettingsPage = useUiStore((s) => s.setSettingsPage);
  const setActiveView = useUiStore((s) => s.setActiveView);

  useEffect(() => {
    if (!hasBridge()) return;
    let cancelled = false;

    const poll = () => {
      bridge()
        ?.mcp.get()
        .then((status) => {
          if (!cancelled) setRunning(status.running);
        })
        .catch(() => {
          if (!cancelled) setRunning(false);
        });
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!running) return null;

  return (
    <button
      type="button"
      onClick={() => {
        setActiveView('settings');
        setSettingsPage('mcp');
      }}
      title="MCP server is listening — open Settings"
      className="flex h-6 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <LuServer aria-hidden className="h-3.5 w-3.5" />
      <span className="status-label">MCP</span>
    </button>
  );
}
