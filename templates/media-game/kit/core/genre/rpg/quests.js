// @ts-check
/**
 * Midnite game kit — a data-driven quest log (engine-free).
 *
 * Quests are JSON (`src/data/quests.json` in the RPG starter): each is a list
 * of stages, and each stage waits for one kind of event — talking to someone,
 * collecting or defeating a number of something, reaching a place. The log is
 * plain JSON state, so a save or a replay reproduces it, and a quest only
 * moves on the event its current stage lists; anything else is ignored.
 */

export const QUEST_EVENTS = /** @type {const} */ (['talk', 'collect', 'defeat', 'reach']);

/**
 * @typedef {{ type: typeof QUEST_EVENTS[number], target: string, count?: number }} QuestTrigger
 * @typedef {{ id: string, text: string, on: QuestTrigger }} QuestStage
 * @typedef {{ xp?: number, gold?: number, item?: string }} QuestReward
 * @typedef {{ id: string, title: string, stages: QuestStage[], reward?: QuestReward }} Quest
 * @typedef {{ status: 'inactive' | 'active' | 'done', stage: number, progress: number }} QuestState
 * @typedef {{ quests: Record<string, Quest>, state: Record<string, QuestState> }} QuestLog
 * @typedef {{ type: typeof QUEST_EVENTS[number], target: string, count?: number }} QuestEvent
 */

const isObject = (/** @type {unknown} */ v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate `quests.json` (`{ quests: Quest[] }`). Never throws.
 * @param {unknown} json
 * @returns {{ ok: true, value: Quest[] } | { ok: false, message: string }}
 */
export function validateQuests(json) {
  if (!isObject(json) || !Array.isArray(/** @type {{ quests?: unknown }} */ (json).quests)) {
    return { ok: false, message: 'quests.json needs a "quests" array.' };
  }
  const list = /** @type {unknown[]} */ (/** @type {{ quests: unknown[] }} */ (json).quests);
  const seen = new Set();
  for (const [i, q] of list.entries()) {
    const at = `quests[${i}]`;
    if (!isObject(q)) return { ok: false, message: `${at} is not an object.` };
    const quest = /** @type {Record<string, unknown>} */ (q);
    if (typeof quest.id !== 'string' || quest.id === '') return { ok: false, message: `${at} needs an "id".` };
    if (seen.has(quest.id)) return { ok: false, message: `Quest "${quest.id}" is listed twice.` };
    seen.add(quest.id);
    if (typeof quest.title !== 'string') return { ok: false, message: `Quest "${quest.id}" needs a "title".` };
    if (!Array.isArray(quest.stages) || quest.stages.length === 0) return { ok: false, message: `Quest "${quest.id}" needs at least one stage.` };
    for (const [j, s] of quest.stages.entries()) {
      const stage = /** @type {Record<string, unknown>} */ (s);
      const on = /** @type {Record<string, unknown>} */ (stage?.on);
      if (!isObject(stage) || typeof stage.id !== 'string' || typeof stage.text !== 'string' || !isObject(on)) {
        return { ok: false, message: `Quest "${quest.id}" stage ${j} needs "id", "text" and "on".` };
      }
      if (!QUEST_EVENTS.includes(/** @type {never} */ (on.type))) {
        return { ok: false, message: `Quest "${quest.id}" stage "${stage.id}" waits for an unknown event "${String(on.type)}".` };
      }
      if (typeof on.target !== 'string') return { ok: false, message: `Quest "${quest.id}" stage "${stage.id}" needs a "target".` };
      if (on.count !== undefined && !(Number.isInteger(on.count) && /** @type {number} */ (on.count) > 0)) {
        return { ok: false, message: `Quest "${quest.id}" stage "${stage.id}" has a bad "count".` };
      }
    }
  }
  return { ok: true, value: /** @type {Quest[]} */ (list) };
}

/** @param {readonly Quest[]} quests @returns {QuestLog} */
export function createQuestLog(quests) {
  return {
    quests: Object.fromEntries(quests.map((q) => [q.id, q])),
    state: Object.fromEntries(quests.map((q) => [q.id, { status: /** @type {const} */ ('inactive'), stage: 0, progress: 0 }])),
  };
}

/** @returns {boolean} false when the quest is unknown or already started */
export function startQuest(/** @type {QuestLog} */ log, /** @type {string} */ id) {
  const s = log.state[id];
  if (!s || s.status !== 'inactive') return false;
  log.state[id] = { status: 'active', stage: 0, progress: 0 };
  return true;
}

/** The stage a quest is waiting on, or null when it is not active. */
export function currentStage(/** @type {QuestLog} */ log, /** @type {string} */ id) {
  const s = log.state[id];
  const quest = log.quests[id];
  if (!s || !quest || s.status !== 'active') return null;
  return quest.stages[s.stage] ?? null;
}

/**
 * Feed one event to every active quest. A quest moves only when the event is
 * exactly the one its current stage lists (same type and target); a count
 * stage needs that many.
 * @param {QuestLog} log
 * @param {QuestEvent} event
 * @returns {{ quest: string, stage: string, completed: boolean, reward: QuestReward | null }[]} what moved
 */
export function questEvent(log, event) {
  /** @type {{ quest: string, stage: string, completed: boolean, reward: QuestReward | null }[]} */
  const moved = [];
  for (const [id, s] of Object.entries(log.state)) {
    const quest = log.quests[id];
    const stage = currentStage(log, id);
    if (!quest || !stage || stage.on.type !== event.type || stage.on.target !== event.target) continue;
    const progress = s.progress + (event.count ?? 1);
    if (progress < (stage.on.count ?? 1)) {
      log.state[id] = { ...s, progress };
      continue;
    }
    const last = s.stage + 1 >= quest.stages.length;
    log.state[id] = last ? { status: 'done', stage: s.stage, progress: 0 } : { status: 'active', stage: s.stage + 1, progress: 0 };
    moved.push({ quest: id, stage: stage.id, completed: last, reward: last ? (quest.reward ?? null) : null });
  }
  return moved;
}

/** Status of one quest (`'inactive'` for an unknown id). */
export const questStatus = (/** @type {QuestLog} */ log, /** @type {string} */ id) => log.state[id]?.status ?? 'inactive';

/** The journal: active quests with their current objective text, then finished ones. */
export function journal(/** @type {QuestLog} */ log) {
  return Object.values(log.quests)
    .filter((q) => questStatus(log, q.id) !== 'inactive')
    .map((q) => {
      const s = /** @type {QuestState} */ (log.state[q.id]);
      const stage = q.stages[s.stage];
      const need = stage?.on.count ?? 1;
      return {
        id: q.id,
        title: q.title,
        done: s.status === 'done',
        objective: s.status === 'done' ? 'Complete' : `${stage?.text ?? ''}${need > 1 ? ` (${s.progress}/${need})` : ''}`,
      };
    })
    .sort((a, b) => Number(a.done) - Number(b.done));
}
