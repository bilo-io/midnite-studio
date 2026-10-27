import { useEffect, useState } from 'react';
import { LuCheck, LuCopy, LuShieldCheck } from 'react-icons/lu';

import type { ToolApprovalHookInfo } from '@midnite/studio-shared';

/**
 * The CLI policy hook card in the Setup wizard (Phase 121 Theme B).
 *
 * Shows the exact hook entries for Claude Code and Codex, plus the script path,
 * so the user can configure them manually. Per Phase 115 F, Midnite Studio never
 * writes directly to ~/.claude or ~/.codex configuration files.
 */
export function PolicyHookCard() {
  const [info, setInfo] = useState<ToolApprovalHookInfo | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.midniteStudio?.toolApproval : undefined;
    if (!api?.hookInfo) return;
    let live = true;
    api
      .hookInfo()
      .then((res) => {
        if (!live) return;
        if (res.ok) setInfo(res.value);
        else setError(res.kind === 'error' ? res.message : 'Could not read policy hook path');
      })
      .catch((err) => live && setError(String(err)));
    return () => {
      live = false;
    };
  }, []);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Clipboard write failed
    }
  };

  if (!info && !error) return null;

  return (
    <section
      aria-label="CLI policy hook"
      data-testid="policy-hook-card"
      className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-3.5 text-xs text-foreground"
    >
      <div className="flex items-center gap-2">
        <LuShieldCheck aria-hidden className="h-4 w-4 text-primary" />
        <h4 className="font-semibold text-foreground">CLI Policy Hook (Optional)</h4>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Enforce the tool-call policy on CLI sessions outside the MCP server (Claude Code and Codex). Per privacy rules,
        Midnite Studio does not edit your CLI configuration files automatically.
      </p>

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : info ? (
        <div className="flex flex-col gap-2.5">
          <div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-medium text-muted-foreground">Script path</span>
              <button
                type="button"
                onClick={() => void copy('path', info.scriptPath)}
                aria-label="Copy script path"
                data-testid="copy-hook-path"
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                {copiedKey === 'path' ? <LuCheck aria-hidden className="h-3 w-3" /> : <LuCopy aria-hidden className="h-3 w-3" />}
                {copiedKey === 'path' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code className="block break-all rounded bg-muted/50 p-2 font-mono text-[10px] text-foreground">
              {info.scriptPath}
            </code>
          </div>

          <div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-medium text-muted-foreground">Claude Code (~/.claude/settings.json)</span>
              <button
                type="button"
                onClick={() => void copy('claude', info.claudeSnippet)}
                aria-label="Copy Claude hook snippet"
                data-testid="copy-claude-hook"
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                {copiedKey === 'claude' ? <LuCheck aria-hidden className="h-3 w-3" /> : <LuCopy aria-hidden className="h-3 w-3" />}
                {copiedKey === 'claude' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted/50 p-2 font-mono text-[10px] leading-tight text-foreground">
              {info.claudeSnippet}
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-medium text-muted-foreground">Codex (~/.codex/hooks.json)</span>
              <button
                type="button"
                onClick={() => void copy('codex', info.codexSnippet)}
                aria-label="Copy Codex hook snippet"
                data-testid="copy-codex-hook"
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                {copiedKey === 'codex' ? <LuCheck aria-hidden className="h-3 w-3" /> : <LuCopy aria-hidden className="h-3 w-3" />}
                {copiedKey === 'codex' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre className="overflow-x-auto rounded bg-muted/50 p-2 font-mono text-[10px] leading-tight text-foreground">
              {info.codexSnippet}
            </pre>
          </div>
        </div>
      ) : null}
    </section>
  );
}
