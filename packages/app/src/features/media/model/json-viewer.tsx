import { lazy, Suspense } from 'react';

import { Spinner } from '../../../components/skeleton';
import { useMediaFileText } from '../use-media';

/** Monaco is heavy and only this pane wants it, so it loads on first use — the API client's field, read-only. */
const MonacoField = lazy(() => import('../../api-client/monaco-field').then((m) => ({ default: m.MonacoField })));

/** `{"a":1}` → two-space indented; text that is not JSON is shown as it is rather than hidden. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The centre pane for `model.json` and any other `.json` in a model folder: pretty-printed, read-only. */
export function JsonFileViewer({ repoId, project, path }: { repoId: string; project: string; path: string }) {
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
    <div className="flex h-full min-h-0 flex-col" data-testid="json-viewer">
      <div className="h-full min-h-0 flex-1">
        <Suspense
          fallback={
            <pre className="h-full overflow-auto p-3 font-mono text-xs" data-testid="json-viewer-fallback">
              {text}
            </pre>
          }
        >
          <MonacoField value={text} onChange={() => undefined} language="json" height="100%" readOnly />
        </Suspense>
      </div>
    </div>
  );
}
