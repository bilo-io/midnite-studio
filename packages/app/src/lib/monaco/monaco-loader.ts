import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// `?worker&inline` — see the comment on `worker` in `vite.config.ts` for why
// this must be `&inline` rather than plain `?worker`: the packaged renderer
// loads from an opaque `file://` origin, which blocks a worker built off a
// `file:` URL. A curated diet of five workers only (Verification's "curated
// worker diet") — everything else uses Monarch tokenizers.
//
// NOT `monaco-editor/esm/vs/...` — `monaco-editor`'s own `package.json`
// `exports` map is `"./*": "./esm/vs/*.js"`, so that prefix is already
// implied; including it again resolves to the doubled, nonexistent
// `esm/vs/esm/vs/...` and fails only at a PRODUCTION build (Rollup resolves
// through `exports`; Vite's dev-server pre-bundler is more forgiving).
import EditorWorker from 'monaco-editor/editor/editor.worker?worker&inline';
import CssWorker from 'monaco-editor/language/css/css.worker?worker&inline';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker&inline';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker&inline';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker&inline';

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

let monacoPromise: Promise<typeof import('monaco-editor')> | null = null;

/**
 * The Monaco module, as a memoised lazy singleton — the same shape as
 * `lib/highlighter.ts`'s `highlighterPromise`. Zero eager languages: Monaco's
 * language *services* (the ts/json/css/html workers) are wired below, but no
 * `monaco.languages.register` call runs here — Monaco registers its bundled
 * languages internally on import, the same "engine now, grammars/languages on
 * first use" split Shiki already follows in this codebase.
 *
 * `loader.config({ monaco })` points `@monaco-editor/react`'s `<Editor>` at
 * THIS statically-imported, locally-bundled instance, so it never reaches for
 * its default `cdn.jsdelivr.net` path — the whole point of Theme A.
 */
export function getMonaco(): Promise<typeof import('monaco-editor')> {
  return (monacoPromise ??= (async () => {
    if (typeof window !== 'undefined') {
      window.MonacoEnvironment = {
        // The default arm is required: an unmatched label with no fallback
        // throws inside Monaco with no useful message.
        getWorker(_workerId: string, label: string) {
          switch (label) {
            case 'typescript':
            case 'javascript':
              return new TsWorker();
            case 'json':
              return new JsonWorker();
            case 'css':
            case 'scss':
            case 'less':
              return new CssWorker();
            case 'html':
            case 'handlebars':
            case 'razor':
              return new HtmlWorker();
            default:
              return new EditorWorker();
          }
        },
      };
    }
    loader.config({ monaco });
    return monaco;
  })());
}
