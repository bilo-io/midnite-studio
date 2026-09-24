import { SettingsSwitchRow } from '../../../components/form/settings-switch-row';
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
        
        <SettingsSwitchRow
          id="search-case-sensitive"
          label="Case Sensitive"
          description="Match exact letter casing by default in grep and history search."
          on={flags.ignoreCase === false}
          onToggle={(_id, next) => setFlags({ ignoreCase: !next })}
        />

        <SettingsSwitchRow
          id="search-regexp"
          label="Use Regular Expressions"
          description="Treat query string as extended regex pattern (-E)."
          on={flags.regexp}
          onToggle={(_id, next) => setFlags({ regexp: next })}
          className="border-t border-border/50 !rounded-none pt-3"
        />

        <SettingsSwitchRow
          id="search-word-match"
          label="Match Whole Word"
          description="Require matches to be surrounded by word boundaries (-w)."
          on={flags.wordMatch}
          onToggle={(_id, next) => setFlags({ wordMatch: next })}
          className="border-t border-border/50 !rounded-none pt-3"
        />
      </div>
    </div>
  );
}
