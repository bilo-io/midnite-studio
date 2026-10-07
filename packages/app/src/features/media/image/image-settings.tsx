import { IMAGE_PROVIDERS, type SecretKey } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuKey, LuLock } from 'react-icons/lu';

import { useImageSecretHas, useSetImageSecret } from './use-images';

/**
 * Settings ▸ Media ▸ Images (Phase 99 Theme C): one API-key row per keyed provider. Keys go straight to
 * main's vault; this page only ever learns whether one is set.
 */
export function ImageSettingsSection() {
  return (
    <div className="flex flex-col gap-4 p-3">
      {IMAGE_PROVIDERS.filter((p) => p.secretKey).map((p) => (
        <ApiKeyRow key={p.id} label={p.label} secretKey={p.secretKey!} />
      ))}
    </div>
  );
}

export function ApiKeyRow({ label, secretKey }: { label: string; secretKey: SecretKey }) {
  const has = useImageSecretHas(secretKey);
  const set = useSetImageSecret(secretKey);
  const [value, setValue] = useState('');
  const save = () => {
    const trimmed = value.trim();
    if (trimmed) set.mutate(trimmed, { onSuccess: () => setValue('') });
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">{label} API key</p>
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-xs">
        <LuLock aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        {has.data?.hasKey ? (
          <>
            <span className="flex flex-1 items-center gap-1 text-foreground">
              <LuKey aria-hidden className="h-3.5 w-3.5" />
              Key set
            </span>
            <button
              type="button"
              onClick={() => set.mutate('')}
              disabled={set.isPending}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-50"
            >
              Clear
            </button>
          </>
        ) : (
          <>
            <input
              type="password"
              aria-label={`${label} API key`}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
              placeholder={`Paste a ${label} API key`}
              className="h-5 flex-1 bg-transparent text-xs placeholder:text-muted-foreground/70 focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={save}
              disabled={value.trim().length === 0 || set.isPending}
              className="rounded-md border border-primary bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}
