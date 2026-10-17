import { RingSpinner as Spinner, useMediaKit } from '@midnite/studio-frame';
import { Suspense } from 'react';

import { useModelHost } from './host';

/** `{"a":1}` → two-space indented; text that is not JSON is shown as it is rather than hidden. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The plain read-only view, used until (and without) the host's code editor. */
function PlainJson({ text }: { text: string }) {
  return (
    <pre className="h-full overflow-auto p-3 font-mono text-xs" data-testid="json-viewer-fallback">
      {text}
    </pre>
  );
}

/** The centre pane for `model.json` and any other `.json` in a model folder: pretty-printed, read-only. */
export function JsonFileViewer({ repoId, project, path }: { repoId: string; project: string; path: string }) {
  const { useMediaFileText } = useMediaKit();
  const { JsonView } = useModelHost();
  const file = useMediaFileText(repoId, 'model', project, path);
  if (file.isError) {
    return (
      <p role="alert" className="p-6 text-center text-xs text-destructive">
        Could not read {path}.
      </p>
    );
  }
  if (file.data === undefined) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Spinner /> Opening {path.split('/').pop()}…
      </div>
    );
  }
  const text = prettyJson(file.data);
  return (
    <div className="absolute inset-0 flex min-h-0 flex-col" data-testid="json-viewer">
      <div className="flex min-h-0 flex-1 flex-col">
        {/* The host's editor loads on first use, so the plain text shows until it is ready. */}
        <Suspense fallback={<PlainJson text={text} />}>{JsonView ? <JsonView text={text} /> : <PlainJson text={text} />}</Suspense>
      </div>
    </div>
  );
}
