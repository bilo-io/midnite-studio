import { useSearchStore } from '../../search/search-store';

export function SearchSettingsPage() {
  const flags = useSearchStore((s) => s.flags);
  const setFlags = useSearchStore((s) => s.setFlags);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-xl text-xs text-foreground font-sans">
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-1">Search Settings</h2>
        <p className="text-muted-foreground">
          Configure default search options, limits, and behavior for history & content grep.
        </p>
      </div>

      <div className="flex flex-col gap-4 border border-border rounded-lg p-4 bg-card">
        <h3 className="font-semibold text-foreground text-xs">Search Defaults</h3>
        
        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="font-medium text-foreground">Case Sensitive</div>
            <div className="text-muted-foreground text-[11px]">Match exact letter casing by default in grep and history search.</div>
          </div>
          <input
            type="checkbox"
            checked={flags.ignoreCase === false}
            onChange={(e) => setFlags({ ignoreCase: !e.target.checked })}
            className="rounded border-border text-primary focus:ring-primary"
          />
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer border-t border-border/50 pt-3">
          <div>
            <div className="font-medium text-foreground">Use Regular Expressions</div>
            <div className="text-muted-foreground text-[11px]">Treat query string as extended regex pattern (-E).</div>
          </div>
          <input
            type="checkbox"
            checked={flags.regexp}
            onChange={(e) => setFlags({ regexp: e.target.checked })}
            className="rounded border-border text-primary focus:ring-primary"
          />
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer border-t border-border/50 pt-3">
          <div>
            <div className="font-medium text-foreground">Match Whole Word</div>
            <div className="text-muted-foreground text-[11px]">Require matches to be surrounded by word boundaries (-w).</div>
          </div>
          <input
            type="checkbox"
            checked={flags.wordMatch}
            onChange={(e) => setFlags({ wordMatch: e.target.checked })}
            className="rounded border-border text-primary focus:ring-primary"
          />
        </label>
      </div>
    </div>
  );
}
