import { useEffect, useRef, useState } from 'react';

import type { SecurityScanContentResponse } from '@midnite/studio-shared';

import { bridge } from '../bridge';

/**
 * Scans draft content for prompt-injection signals as it changes (Phase 121 Theme A).
 *
 * Each item is scanned once per distinct text, in main, through `security.scanContent`; the result
 * keeps only the items that crossed the threshold. A missing bridge, a rejected call or an
 * unflagged scan all read as "nothing to show": a banner that cannot be drawn never blocks a send.
 */
export type ScanItem = { id: string; text: string };

function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${text.length}:${hash}`;
}

export function useInjectionScans(items: readonly ScanItem[]): Record<string, SecurityScanContentResponse> {
  const [flagged, setFlagged] = useState<Record<string, SecurityScanContentResponse>>({});
  const seen = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    const live = new Set(items.map((i) => i.id));
    setFlagged((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => live.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    for (const item of items) {
      const key = fingerprint(item.text);
      if (seen.current.get(item.id) === key) continue;
      seen.current.set(item.id, key);
      const api = bridge();
      if (!api) continue;
      void api.security
        .scanContent({ text: item.text })
        .then((scan) => {
          if (cancelled || seen.current.get(item.id) !== key) return;
          setFlagged((current) => {
            const { [item.id]: _previous, ...rest } = current;
            return scan.flagged ? { ...rest, [item.id]: scan } : rest;
          });
        })
        .catch(() => undefined);
    }
    for (const id of [...seen.current.keys()]) if (!live.has(id)) seen.current.delete(id);
    return () => {
      cancelled = true;
    };
  }, [items]);

  return flagged;
}
