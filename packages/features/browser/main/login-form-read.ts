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
/**
 * Caps keep the walk bounded however large or deeply nested the page is. A page can hide a field
 * past them (20k padding elements, 50 empty shadow roots) — the same class of blind spot as a closed
 * shadow root, accepted because an unbounded walk on the page's main thread is worse.
 */
export const LOGIN_FORM_NODE_CAP = 20_000;
export const LOGIN_FORM_ROOT_CAP = 50;
export const LOGIN_FORM_FORM_CAP = 50;
export const LOGIN_FORM_CONTROL_CAP = 500;
/** A read that has not answered by now never will (a frame torn down mid-call) — give up on it. */
export const LOGIN_FORM_READ_TIMEOUT_MS = 5_000;

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
    const getter = (proto, name) => Object.getOwnPropertyDescriptor(proto, name).get;
    const createWalker = Document.prototype.createTreeWalker;
    const nextNode = TreeWalker.prototype.nextNode;
    const localName = getter(Element.prototype, 'localName');
    const shadowOf = getter(Element.prototype, 'shadowRoot');
    const getAttr = Element.prototype.getAttribute;
    const hasAttr = Element.prototype.hasAttribute;
    const inputType = getter(HTMLInputElement.prototype, 'type');
    const buttonType = getter(HTMLButtonElement.prototype, 'type');
    const formOf = getter(HTMLInputElement.prototype, 'form');
    const controlsOf = getter(HTMLFormElement.prototype, 'elements');
    const collectionLength = getter(HTMLCollection.prototype, 'length');
    const collectionItem = HTMLCollection.prototype.item;
    const frameDoc = getter(HTMLIFrameElement.prototype, 'contentDocument');
    const ownerOf = getter(Node.prototype, 'ownerDocument');
    const baseOf = getter(Node.prototype, 'baseURI');
    const urlOf = getter(Document.prototype, 'URL');
    const pageOrigin = new URL(urlOf.call(document)).origin;

    // One bounded walk over the document, every open shadow root and every same-origin frame's
    // document (a cross-origin frame's contentDocument is null). Each element is checked through
    // prototype getters, so an element that only looks like an HTML <input> (an <input> inside <svg>
    // is not an HTMLInputElement) is skipped instead of throwing the whole read away.
    const roots = [document];
    const forms = [];
    let fieldCount = 0;
    let visited = 0;
    for (let r = 0; r < roots.length && visited < ${LOGIN_FORM_NODE_CAP}; r += 1) {
      const root = roots[r];
      const walker = createWalker.call(ownerOf.call(root) || root, root, 1);
      for (let el = nextNode.call(walker); el && visited < ${LOGIN_FORM_NODE_CAP}; el = nextNode.call(walker)) {
        visited += 1;
        const shadow = shadowOf.call(el);
        if (shadow && roots.length < ${LOGIN_FORM_ROOT_CAP}) roots.push(shadow);
        const name = localName.call(el);
        if (name === 'iframe' && roots.length < ${LOGIN_FORM_ROOT_CAP}) {
          try { const inner = frameDoc.call(el); if (inner) roots.push(inner); } catch (e) {}
        } else if (name === 'input') {
          try {
            if (inputType.call(el) !== 'password') continue;
            fieldCount += 1;
            const form = formOf.call(el);
            if (form && forms.length < ${LOGIN_FORM_FORM_CAP} && forms.indexOf(form) === -1) forms.push(form);
          } catch (e) {
            // Not an HTMLInputElement (another namespace): not a password field.
          }
        }
      }
    }

    const origins = new Set();
    const add = (raw, node) => {
      try {
        const empty = raw === null || raw.trim() === '';
        const target = new URL(empty ? urlOf.call(ownerOf.call(node)) : raw, baseOf.call(node));
        if (target.protocol === 'http:' || target.protocol === 'https:') origins.add(target.origin);
      } catch (e) {
        // An unparseable action posts nowhere a rule can name.
      }
    };
    // Can this control submit the form? A <button> whose type reads "submit" (absent or invalid
    // types do), or an <input type=submit|image>.
    const submits = (el) => {
      try { return buttonType.call(el) === 'submit'; } catch (e) {}
      try { const t = inputType.call(el); return t === 'submit' || t === 'image'; } catch (e) {}
      return false;
    };
    for (let f = 0; f < forms.length; f += 1) {
      const form = forms[f];
      add(getAttr.call(form, 'action'), form);
      // A submitter's formaction overrides the form's action — including one tied to the form by
      // its form= attribute from elsewhere in the page, which form.elements lists.
      const controls = controlsOf.call(form);
      const count = Math.min(collectionLength.call(controls), ${LOGIN_FORM_CONTROL_CAP});
      for (let i = 0; i < count; i += 1) {
        const control = collectionItem.call(controls, i);
        if (control && hasAttr.call(control, 'formaction') && submits(control)) add(getAttr.call(control, 'formaction'), control);
      }
    }
    // Plain-http and other-origin targets first, so same-origin ones can never crowd them out of the cap.
    const rank = (o) => (o.indexOf('http:') === 0 ? 0 : o !== pageOrigin ? 1 : 2);
    const ordered = Array.from(origins).sort((a, b) => rank(a) - rank(b));
    return { hasPasswordField: fieldCount > 0, formActionOrigins: ordered.slice(0, ${LOGIN_FORM_ACTION_CAP}) };
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), LOGIN_FORM_READ_TIMEOUT_MS);
      (timer as { unref?: () => void }).unref?.();
    });
    const raw = await Promise.race([
      contents.executeJavaScriptInIsolatedWorld(LOGIN_FORM_WORLD_ID, [{ code: LOGIN_FORM_READ_SNIPPET }], false),
      timeout,
    ]);
    const parsed = LoginFormReadSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
