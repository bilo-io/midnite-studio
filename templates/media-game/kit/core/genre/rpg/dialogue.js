// @ts-check
/**
 * Midnite game kit — dialogue trees from JSON (engine-free).
 *
 * A tree is `{ id, root, nodes }`. Each node has a `speaker` and `text`, and
 * then exactly one way on: `choices` (each with `next`), a bare `next`, or
 * `end: true`. A choice may be gated by `requires` (a quest status) and may
 * carry `effects` the game applies — start a quest, raise a quest event, give
 * an item or gold. The validator refuses dangling `next`s and nodes with no
 * way on, and `reachableEnds` proves a conversation can always finish.
 */

/**
 * @typedef {{ type: 'start-quest', quest: string } | { type: 'quest-event', event: import('./quests.js').QuestEvent }
 *   | { type: 'give', item: string } | { type: 'gold', amount: number }} DialogueEffect
 * @typedef {{ quest: string, status: 'inactive' | 'active' | 'done' }} DialogueRequirement
 * @typedef {{ text: string, next: string, requires?: DialogueRequirement, effects?: DialogueEffect[] }} DialogueChoice
 * @typedef {{ speaker: string, text: string, choices?: DialogueChoice[], next?: string, end?: boolean, effects?: DialogueEffect[] }} DialogueNode
 * @typedef {{ id: string, root: string, nodes: Record<string, DialogueNode> }} DialogueTree
 * @typedef {{ questStatus?: (quest: string) => string }} DialogueContext
 */

const isObject = (/** @type {unknown} */ v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every node id a node leads to (all choices, gated or not). @param {DialogueNode} node */
const exits = (node) => [...(node.choices ?? []).map((c) => c.next), ...(node.next ? [node.next] : [])];

/**
 * @param {unknown} json
 * @returns {{ ok: true, value: DialogueTree } | { ok: false, message: string }}
 */
export function validateDialogue(json) {
  if (!isObject(json)) return { ok: false, message: 'A dialogue tree is an object.' };
  const tree = /** @type {Record<string, unknown>} */ (json);
  if (typeof tree.id !== 'string') return { ok: false, message: 'A dialogue tree needs an "id".' };
  if (!isObject(tree.nodes)) return { ok: false, message: `Dialogue "${tree.id}" needs "nodes".` };
  const nodes = /** @type {Record<string, Record<string, unknown>>} */ (tree.nodes);
  if (typeof tree.root !== 'string' || !(tree.root in nodes)) return { ok: false, message: `Dialogue "${tree.id}" has no root node "${String(tree.root)}".` };
  for (const [id, node] of Object.entries(nodes)) {
    if (!isObject(node) || typeof node.speaker !== 'string' || typeof node.text !== 'string') {
      return { ok: false, message: `Dialogue "${tree.id}" node "${id}" needs "speaker" and "text".` };
    }
    const ways = Number(Array.isArray(node.choices) && node.choices.length > 0) + Number(typeof node.next === 'string') + Number(node.end === true);
    if (ways !== 1) return { ok: false, message: `Dialogue "${tree.id}" node "${id}" needs exactly one of "choices", "next" or "end".` };
    for (const next of exits(/** @type {DialogueNode} */ (/** @type {unknown} */ (node)))) {
      if (typeof next !== 'string' || !(next in nodes)) return { ok: false, message: `Dialogue "${tree.id}" node "${id}" leads to a missing node "${String(next)}".` };
    }
  }
  return { ok: true, value: /** @type {DialogueTree} */ (/** @type {unknown} */ (tree)) };
}

/**
 * Every `end` node reachable from the root, and every node that is not.
 * @param {DialogueTree} tree
 */
export function reachableEnds(tree) {
  const seen = new Set([tree.root]);
  const queue = [tree.root];
  while (queue.length > 0) {
    const node = tree.nodes[/** @type {string} */ (queue.shift())];
    if (!node) continue;
    for (const next of exits(node)) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  const ends = Object.keys(tree.nodes).filter((id) => tree.nodes[id]?.end === true);
  return {
    reached: ends.filter((id) => seen.has(id)),
    unreachable: Object.keys(tree.nodes).filter((id) => !seen.has(id)),
  };
}

/**
 * Whether every node can still reach an end (no loop the player cannot leave).
 * @param {DialogueTree} tree
 */
export function everyNodeCanEnd(tree) {
  const canEnd = new Set(Object.keys(tree.nodes).filter((id) => tree.nodes[id]?.end === true));
  let grew = true;
  while (grew) {
    grew = false;
    for (const [id, node] of Object.entries(tree.nodes)) {
      if (!canEnd.has(id) && exits(node).some((n) => canEnd.has(n))) {
        canEnd.add(id);
        grew = true;
      }
    }
  }
  return Object.keys(tree.nodes).every((id) => canEnd.has(id));
}

/** The choices a player may pick at `node` given the context (gated ones dropped). */
export function availableChoices(/** @type {DialogueNode} */ node, /** @type {DialogueContext} */ ctx = {}) {
  return (node.choices ?? []).filter((c) => !c.requires || (ctx.questStatus?.(c.requires.quest) ?? 'inactive') === c.requires.status);
}

/** @param {DialogueTree} tree */
export function startConversation(tree) {
  const node = /** @type {DialogueNode} */ (tree.nodes[tree.root]);
  return { tree, at: tree.root, node, done: false, effects: [...(node.effects ?? [])] };
}

/** @typedef {ReturnType<typeof startConversation>} Conversation */

/**
 * Advance: pick choice `index` of the available ones, or continue a `next`
 * node (index ignored). Returns the effects to apply for this step.
 * @param {Conversation} conv
 * @param {number} index
 * @param {DialogueContext} [ctx]
 * @returns {DialogueEffect[]}
 */
export function advance(conv, index = 0, ctx = {}) {
  if (conv.done) return [];
  /** @type {DialogueEffect[]} */
  const effects = [];
  let next = null;
  if (conv.node.end) {
    conv.done = true;
    return [];
  }
  if (conv.node.next) next = conv.node.next;
  else {
    const choice = availableChoices(conv.node, ctx)[index];
    if (!choice) return [];
    next = choice.next;
    effects.push(...(choice.effects ?? []));
  }
  conv.at = next;
  conv.node = /** @type {DialogueNode} */ (conv.tree.nodes[next]);
  effects.push(...(conv.node.effects ?? []));
  conv.effects = effects;
  return effects;
}
