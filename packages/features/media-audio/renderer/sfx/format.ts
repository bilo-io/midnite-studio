/** `2_117_683_571` → `2.12 GB`. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} KB`;
  return `${bytes} B`;
}

/** `1.5` → `1.5 s`, `3` → `3 s`. */
export const formatSeconds = (seconds: number) => `${Math.round(seconds * 10) / 10} s`;
