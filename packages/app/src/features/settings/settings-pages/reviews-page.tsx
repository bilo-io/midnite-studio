import { useForgeCli } from '../../../services/queries';
import { useUiStore } from '../../../store/ui-store';
import { Field } from './controls';

/**
 * Reviews — the switch in front of everything this app can change on GitHub.
 *
 * A page of its own, and one switch on it, for the same reason the Monitor page
 * exists: this is the place where you can see, in one screen, what you have
 * allowed the app to do on your behalf, and take it back. Folding it into
 * Appearance as a stray checkbox would make it findable only by someone who
 * already knew it was there.
 *
 * It is deliberately **not** the same shape as Phase 18's diagnostics trust.
 * That prompt is per-repository and appears at the moment of use, because
 * running a repo's own linter executes arbitrary code the repo chose, and
 * consent for one repository says nothing about another. Nothing here executes
 * anyone's code — these calls go through the user's own already-authenticated
 * `gh`, against a repository they opened, doing things they could equally type
 * into a terminal. One machine-wide switch is the honest weight for that: a
 * guard against the accidental click, not a security boundary, and this page
 * says so rather than implying a protection it does not provide.
 *
 * One switch, not two — the Issues view's own two writes (Phase 54 Theme G)
 * are gated here rather than growing a second page, per that theme's own
 * "no new gate, no exception" rule. This page's "What stays out" list is the
 * one place both write surfaces are named together, so it has to stay
 * accurate for both — it used to claim the app "never writes to issues",
 * which Theme G made false; see that bullet's replacement below.
 */
export function ReviewsPage() {
  const enabled = useUiStore((s) => s.forgeWritesEnabled);
  const setEnabled = useUiStore((s) => s.setForgeWritesEnabled);
  const cli = useForgeCli();

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Review actions"
        hint="Whether the Reviews page may approve, request changes, comment, merge, request reviewers, take a pull request out of draft, or re-run checks — and whether the Issues page may comment, close or reopen an issue, or add either to a project. Off until you turn it on."
      >
        <label className="flex cursor-pointer items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 accent-[hsl(var(--primary))]"
          />
          <span>
            Allow Midnite Studio to act on pull requests and issues
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
              Every action runs through your own <code>gh</code> CLI, as you, and is shown before it
              is sent. Merging additionally asks for confirmation with the number of commits it
              would land.
            </span>
          </span>
        </label>
      </Field>

      <Field
        label="What stays out"
        hint="The write surface is pull-request review and two issue actions, and nothing else, by design."
      >
        {/*
          Listed, rather than left to the reader to infer from an absence of
          buttons. "What can this app change?" is a question that deserves an
          answer on the page where the permission is granted — and the negative
          half of that answer is the half a user cannot verify by looking.
        */}
        <ul className="flex flex-col gap-1 text-[11px] leading-relaxed text-muted-foreground">
          <li>· It never creates a pull request or an issue, or closes a pull request outside a merge.</li>
          <li>· It never edits labels, milestones, assignees or branch protection.</li>
          <li>· It never force-pushes, and never deletes a branch when merging.</li>
          <li>· It never edits or deletes a comment — yours or anyone else&rsquo;s.</li>
        </ul>
      </Field>

      {/*
        The switch can be on while the capability is unavailable, and saying so
        here saves a user hunting for a greyed button they have already enabled.
        `not-installed` doubles as "this repo has no GitHub remote" elsewhere in
        the app, so the wording stays about `gh` itself — which is what this
        machine-wide page is actually about.
      */}
      {enabled && cli.data !== undefined && cli.data.reason !== 'ready' ? (
        <p className="rounded border border-border bg-muted/30 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {cli.data.hint.length > 0
            ? cli.data.hint
            : 'The GitHub CLI is not available on this machine, so review actions cannot run yet.'}
        </p>
      ) : null}
    </div>
  );
}
