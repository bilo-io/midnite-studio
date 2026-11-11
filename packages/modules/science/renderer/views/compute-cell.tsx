import 'katex/dist/katex.min.css';

import katex from 'katex';

import type { CellResult } from '../compute/evaluate';

/** The result row under a compute cell: KaTeX of the expression beside the value, or `Line N: message`. */
export function ComputeResult({ result, pending }: { result: CellResult | undefined; pending: boolean }) {
  if (result === undefined) {
    return pending ? <p className="px-2 text-xs opacity-60">Computing…</p> : null;
  }
  if (!result.ok) {
    return (
      <p role="alert" className="px-2 text-xs text-red-400">
        Line {result.line}: {result.message}
      </p>
    );
  }
  let html: string | null = null;
  if (result.tex !== undefined) {
    try {
      html = katex.renderToString(result.tex, { throwOnError: false, strict: 'ignore' });
    } catch {
      html = null;
    }
  }
  return (
    <div className="flex flex-wrap items-baseline gap-3 px-2 text-sm" data-testid="compute-result">
      {html !== null ? <span dangerouslySetInnerHTML={{ __html: html }} /> : null}
      <span className="font-mono text-xs opacity-70">{result.text}</span>
      {pending ? <span className="text-xs opacity-60">Computing…</span> : null}
    </div>
  );
}
