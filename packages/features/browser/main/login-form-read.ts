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
 * **Shadow roots and same-origin frames are walked; cross-origin frames are not.** The snippet runs in
 * the top document and reaches into every open shadow root and every same-origin (or `srcdoc`)
 * iframe's document, bounded by {@link LOGIN_FORM_NODE_CAP}/{@link LOGIN_FORM_ROOT_CAP}. A password
 * field in a *closed* shadow root or a cross-origin iframe is not seen — the latter's own navigation
 * is not a tab commit either.
 */

/**
 * The world id the read runs in. Never `0` (the page's main world) and never `999` (Electron's
 * context-isolation world, where a preload would live — browser tabs have none, but the id is
 * reserved). Any other id gets its own fresh world per frame.
 */
export const LOGIN_FORM_WORLD_ID = 1117;

/** Caps keep the answer small however many forms a page carries. */
export const LOGIN_FORM_ACTION_CAP = 10;
/** Caps keep the walk bounded however large or deeply nested the page is. */
export const LOGIN_FORM_FIELD_CAP = 50;
export const LOGIN_FORM_ROOT_CAP = 50;
export const LOGIN_FORM_NODE_CAP = 20_000;

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
    const docQsa = Document.prototype.querySelectorAll;
    const fragQsa = DocumentFragment.prototype.querySelectorAll;
    const qsaIn = Element.prototype.querySelectorAll;
    const getAttr = Element.prototype.getAttribute;
    const formOf = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'form').get;
    const shadowOf = Object.getOwnPropertyDescriptor(Element.prototype, 'shadowRoot').get;
    const frameDoc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentDocument').get;
    const ownerOf = Object.getOwnPropertyDescriptor(Node.prototype, 'ownerDocument').get;
    const baseOf = Object.getOwnPropertyDescriptor(Node.prototype, 'baseURI').get;
    const urlOf = Object.getOwnPropertyDescriptor(Document.prototype, 'URL').get;
    const pageOrigin = new URL(urlOf.call(document)).origin;
    const query = (root, selector) => {
      try { return docQsa.call(root, selector); } catch (e) { return fragQsa.call(root, selector); }
    };
    // The roots a password field can sit in: the document, every open shadow root, and every
    // same-origin frame's document (a cross-origin frame's contentDocument is null). Bounded.
    const roots = [document];
    let visited = 0;
    for (let r = 0; r < roots.length && roots.length < ${LOGIN_FORM_ROOT_CAP}; r += 1) {
      const all = query(roots[r], '*');
      for (let i = 0; i < all.length && visited < ${LOGIN_FORM_NODE_CAP} && roots.length < ${LOGIN_FORM_ROOT_CAP}; i += 1, visited += 1) {
        const shadow = shadowOf.call(all[i]);
        if (shadow) roots.push(shadow);
      }
      const frames = query(roots[r], 'iframe');
      for (let i = 0; i < frames.length && roots.length < ${LOGIN_FORM_ROOT_CAP}; i += 1) {
        try { const inner = frameDoc.call(frames[i]); if (inner) roots.push(inner); } catch (e) {}
      }
    }
    const fields = [];
    for (let r = 0; r < roots.length; r += 1) {
      const found = query(roots[r], 'input[type="password" i]');
      for (let i = 0; i < found.length && fields.length < ${LOGIN_FORM_FIELD_CAP}; i += 1) fields.push(found[i]);
    }
    const origins = [];
    const add = (raw, node) => {
      try {
        const empty = raw === null || raw.trim() === '';
        const target = new URL(empty ? urlOf.call(ownerOf.call(node)) : raw, baseOf.call(node));
        if ((target.protocol === 'http:' || target.protocol === 'https:') && origins.indexOf(target.origin) === -1) {
          origins.push(target.origin);
        }
      } catch (e) {
        // An unparseable action posts nowhere a rule can name.
      }
    };
    const seen = [];
    for (let i = 0; i < fields.length; i += 1) {
      const form = formOf.call(fields[i]);
      if (!form || seen.indexOf(form) !== -1) continue;
      seen.push(form);
      add(getAttr.call(form, 'action'), form);
      // A submit button's formaction overrides the form's own action.
      const submitters = qsaIn.call(form, 'button[formaction],input[type="submit" i][formaction],input[type="image" i][formaction]');
      for (let j = 0; j < submitters.length; j += 1) add(getAttr.call(submitters[j], 'formaction'), submitters[j]);
    }
    // Plain-http and other-origin targets first, so same-origin ones can never crowd them out of the cap.
    const rank = (o) => (o.indexOf('http:') === 0 ? 0 : o !== pageOrigin ? 1 : 2);
    origins.sort((a, b) => rank(a) - rank(b));
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
