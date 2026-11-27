import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';

/*
  Phase 77 Theme A — Monaco from `editor.api`, not the package root.

  The package root is `editor.main`: the editor PLUS every `editor.all` feature contribution PLUS
  the four language services. `editor.api` is the editor alone, so what the app needs is named
  here, each with the call site that proves it, and everything else stays out of the bundle.

    find widget, suggest widget, parameter hints
        `files/preview/code-editor.tsx` reads the `findWidgetVisible` / `suggestWidgetVisible` /
        `parameterHintsVisible` context keys off the private `_contextKeyService`; they are
        defined by these three contributions, so dropping one makes Escape's "is a widget open"
        check silently answer false.
    `editor.action.formatDocument`   `api-client` body tab (`formatActions`).
    keybindings (`addCommand`)       `database/query-editor.tsx` binds CtrlCmd+Enter; core commands.
    minimap, word wrap, line highlight, readOnly
                                     editor options in all three hosts (core, no contribution).
  The next group is NOT referenced by the app by option or API, but is on by default in every
  editor a person sees today, and "Monaco opens the same files, nothing visual changes" is this
  phase's guardrail: hover, folding, bracket matching, clipboard and context menu, comment and
  line operations, multi-cursor and selection highlight, word highlight and operations, snippets,
  indentation, links, code actions (TypeScript quick fixes). The niche rest of `editor.all` —
  diff editor, code lens, colour picker, inlay hints, inline completions, sticky scroll, rename,
  reference search, the F1 quick-access palette — is not imported.

  Specifiers omit `esm/vs`: `monaco-editor`'s `exports` map is `"./*": "./esm/vs/*.js"`, so the
  prefix is already implied, and writing it doubles it (fails only at a production Rollup build).
*/
// The two codicon stylesheets sit outside what the exports map can address (`./*` appends `.js`),
// so they are imported by path, as `editor.main` does.
import '../../../node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css';
import '../../../node_modules/monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon-modifiers.css';
import 'monaco-editor/editor/browser/widget/codeEditor/codeEditorWidget';
import 'monaco-editor/editor/browser/coreCommands';
import 'monaco-editor/editor/common/standaloneStrings';
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching';
import 'monaco-editor/editor/contrib/clipboard/browser/clipboard';
import 'monaco-editor/editor/contrib/codeAction/browser/codeActionContributions';
import 'monaco-editor/editor/contrib/comment/browser/comment';
import 'monaco-editor/editor/contrib/contextmenu/browser/contextmenu';
import 'monaco-editor/editor/contrib/find/browser/findController';
import 'monaco-editor/editor/contrib/folding/browser/folding';
import 'monaco-editor/editor/contrib/format/browser/formatActions';
import 'monaco-editor/editor/contrib/hover/browser/hoverContribution';
import 'monaco-editor/editor/contrib/indentation/browser/indentation';
import 'monaco-editor/editor/contrib/linesOperations/browser/linesOperations';
import 'monaco-editor/editor/contrib/links/browser/links';
import 'monaco-editor/editor/contrib/multicursor/browser/multicursor';
import 'monaco-editor/editor/contrib/parameterHints/browser/parameterHints';
import 'monaco-editor/editor/contrib/snippet/browser/snippetController2';
import 'monaco-editor/editor/contrib/suggest/browser/suggestController';
import 'monaco-editor/editor/contrib/tokenization/browser/tokenization';
import 'monaco-editor/editor/contrib/wordHighlighter/browser/wordHighlighter';
import 'monaco-editor/editor/contrib/wordOperations/browser/wordOperations';
import 'monaco-editor/features/find/register';
// Every bundled language's id, extensions and a lazy tokenizer loader: ~24 KB of registrations,
// the tokenizers themselves are dynamic imports (the language registry the phase first proposed
// would have saved nothing).
import 'monaco-editor/basic-languages/monaco.contribution';
// The four language services `editor.main` bundled. Their main-thread halves are small and load
// their heavy `*Mode` modules lazily; the workers they spawn go through `getWorker` below. Static,
// not awaited inside `getMonaco()`: `loader.config({ monaco })` must run before `<Editor>` mounts
// and reaches for its CDN default, and an `await` before it loses that race.
import 'monaco-editor/languages/features/css/register';
import 'monaco-editor/languages/features/html/register';
import 'monaco-editor/languages/features/json/register';
import 'monaco-editor/languages/features/typescript/register';

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

declare global {
  interface Window {
    MonacoEnvironment?: monaco.Environment;
  }
}

type MonacoModule = typeof monaco;

let monacoPromise: Promise<MonacoModule> | null = null;

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
export function getMonaco(): Promise<MonacoModule> {
  return (monacoPromise ??= (async () => {
    if (typeof window !== 'undefined') {
      window.MonacoEnvironment = {
        // The default arm is required: an unmatched label with no fallback
        // throws inside Monaco with no useful message.
        getWorker(_workerId: string, label: string) {
          switch (label) {
            case 'typescript':
            case 'javascript':
              // Monaco accepts a Promise<Worker>. The ~6.8 MB inlined worker is its own lazy
              // chunk, fetched when the first TypeScript or JavaScript model asks for it.
              return import('monaco-editor/language/typescript/ts.worker?worker&inline').then(
                ({ default: TsWorker }) => new TsWorker(),
              );
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
