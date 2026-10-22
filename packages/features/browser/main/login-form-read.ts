import { z } from 'zod';

/**
 * Theme F's one read of page state (Phase 117, Decision 1 / guardrail 1): does the page show a
 * password field, and where do the forms holding one post?
 *
 * **An isolated world, never the main world.** The page being judged owns its main world — it can
 * redefine `querySelectorAll`, the `type` getter or `Array.prototype` and answer "no password field"
 * on exactly the pages this theme exists for. A world of our own sees the same DOM through pristine
 * prototypes the page cannot reach. Even so, the snippet calls every DOM method through its
 * prototype (`Document.prototype.querySelectorAll.call(document, …)`), because *named-property
 * clobbering* crosses worlds: `<input name="action">` shadows `form.action` and `<img name="URL">`
 * shadows `document.URL` in any world, since those are properties of the DOM objects themselves.
 *
 * **Installs nothing.** The snippet is one expression that returns a plain object — no listener, no
 * global, no timer, no `MutationObserver` — so after it returns the world holds no state of ours.
 * A page that adds its password field later is caught by the next read (main re-reads on
 * `did-stop-loading` and on an in-page navigation, not by watching).
 *
 * **Main frame only.** `executeJavaScriptInIsolatedWorld` runs in the top document; a password field
 * inside a cross-origin iframe is not seen (the iframe's own navigation is not a tab commit either).
 */

/**
 * The world id the read runs in. Never `0` (the page's main world) and never `999` (Electron's
 * context-isolation world, where a preload would live — browser tabs have none, but the id is
 * reserved). Any other id gets its own fresh world per frame.
 */
export const LOGIN_FORM_WORLD_ID = 1117;

/** Caps keep the answer small however many forms a page carries. */
export const LOGIN_FORM_ACTION_CAP = 10;

export const LoginFormReadSchema = z.object({
  hasPasswordField: z.boolean(),
  /** The `http(s)` origins forms holding a password field submit to, de-duplicated. */
  formActionOrigins: z.array(z.string()).max(LOGIN_FORM_ACTION_CAP),
});
export type LoginFormRead = z.infer<typeof LoginFormReadSchema>;

/**
 * The fixed snippet. One IIFE, no interpolation — nothing from the page or the app is ever spliced
 * into it. `try` around the whole body so a hostile DOM can only make it answer "nothing found",
 * never throw into main.
 */
export const LOGIN_FORM_READ_SNIPPET = `(() => {
  try {
    const qsa = Document.prototype.querySelectorAll;
    const qsaIn = Element.prototype.querySelectorAll;
    const getAttr = Element.prototype.getAttribute;
    const formOf = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'form').get;
    const docUrl = Object.getOwnPropertyDescriptor(Document.prototype, 'URL').get.call(document);
    const baseUrl = Object.getOwnPropertyDescriptor(Node.prototype, 'baseURI').get.call(document);
    const fields = qsa.call(document, 'input[type="password" i]');
    const origins = [];
    const add = (raw) => {
      try {
        const target = new URL(raw === null || raw.trim() === '' ? docUrl : raw, baseUrl);
        if ((target.protocol === 'http:' || target.protocol === 'https:') && origins.indexOf(target.origin) === -1) {
          origins.push(target.origin);
        }
      } catch (e) {
        // An unparseable action posts nowhere a rule can name.
      }
    };
    const seen = [];
    for (let i = 0; i < fields.length && origins.length < ${LOGIN_FORM_ACTION_CAP}; i += 1) {
      const form = formOf.call(fields[i]);
      if (!form || seen.indexOf(form) !== -1) continue;
      seen.push(form);
      add(getAttr.call(form, 'action'));
      // A submit button's formaction overrides the form's own action.
      const submitters = qsaIn.call(form, '[formaction]');
      for (let j = 0; j < submitters.length; j += 1) add(getAttr.call(submitters[j], 'formaction'));
    }
    return { hasPasswordField: fields.length > 0, formActionOrigins: origins.slice(0, ${LOGIN_FORM_ACTION_CAP}) };
  } catch (e) {
    return { hasPasswordField: false, formActionOrigins: [] };
  }
})()`;

/** The `webContents` method the read needs — Electron's `executeJavaScriptInIsolatedWorld`. */
export type IsolatedWorldContents = {
  executeJavaScriptInIsolatedWorld(worldId: number, scripts: Array<{ code: string }>, userGesture?: boolean): Promise<unknown>;
};

/**
 * Run the snippet in {@link LOGIN_FORM_WORLD_ID} and validate what came back. `null` when the read
 * failed (the page navigated away mid-read, the contents are gone) or answered something that is
 * not a {@link LoginFormRead} — the caller then leaves the verdict as it was.
 */
export async function readLoginForm(contents: IsolatedWorldContents): Promise<LoginFormRead | null> {
  try {
    const raw = await contents.executeJavaScriptInIsolatedWorld(LOGIN_FORM_WORLD_ID, [{ code: LOGIN_FORM_READ_SNIPPET }], false);
    const parsed = LoginFormReadSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
