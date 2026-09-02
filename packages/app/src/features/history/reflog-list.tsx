/**
 * "What this repository recorded" — the reflog tab beside `JournalList`.
 *
 * Phase 22 Theme G (the reflog reader: `git-engine/src/commands/reflog.ts`,
 * a ref selector, the checkout-able entry list) has NOT landed in this
 * checkout — this file exists so the History view has two tabs to show
 * rather than the Journal sitting alone with nowhere to put its sibling.
 * It is an honest placeholder, not a stand-in with invented data: Theme H's
 * own scope note is explicit that this pass builds the journal tab "beside
 * Theme G's reflog tab" and does not rebuild that tab — since there is
 * nothing built yet to sit beside, this says so rather than pretending
 * otherwise.
 *
 * Replace this component's body with the real ref selector + time-ordered
 * list once Theme G lands; nothing else in `HistoryView` needs to change.
 */
export function ReflogList() {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-8">
      <p className="max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        Reflog browsing lands with Phase 22 Theme G, which has not been built in this checkout yet.
        Once it has, this tab shows the ref-scoped, checkout-able reflog the phase doc describes.
      </p>
    </div>
  );
}
