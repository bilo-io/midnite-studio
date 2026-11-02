import { ANIMATION_MAX_TAGS, type AnimationTagId } from '@midnite/studio-shared';

/**
 * Auto-tags for an imported clip (Phase 125 Theme B): the words of its name (and its folder's) matched against
 * a small table. A rule ending in `*` is a prefix (`walk*` matches `walking`); any other is the whole word, so
 * `hit` never matches `white` and `die` never matches `diesel`.
 */
const RULES: Record<AnimationTagId, readonly string[]> = {
  locomotion: ['walk*', 'run', 'runs', 'running', 'jog*', 'sprint*', 'strafe*', 'strafing', 'crouch*', 'sneak*', 'creep*', 'march*', 'limp*', 'swim*', 'turn', 'turning', 'sidestep*', 'locomotion', 'backpedal*'],
  traversal: ['jump*', 'climb*', 'fall', 'falling', 'falls', 'vault*', 'roll', 'rolling', 'flip*', 'land', 'landing', 'hang*', 'slide', 'sliding', 'ledge', 'ladder', 'mantle', 'leap*', 'traversal'],
  combat: ['punch*', 'kick*', 'slash*', 'sword*', 'attack*', 'block*', 'shoot*', 'rifle', 'pistol', 'aim', 'aiming', 'melee', 'strike*', 'stab*', 'combo', 'fight*', 'boxing', 'uppercut', 'slam', 'throw*', 'cast', 'casting', 'spell', 'reload*', 'swing*', 'parry', 'axe', 'knife', 'dagger', 'dodge*', 'sabre', 'saber', 'weapon', 'gun', 'combat'],
  reaction: ['hit', 'hits', 'death', 'die', 'dies', 'dying', 'dead', 'reaction*', 'stagger*', 'knock*', 'flinch*', 'damage*', 'stun*', 'hurt', 'pain', 'recoil*', 'getup'],
  idle: ['idle*', 'breathing', 'stand', 'standing', 'wait*', 'stance', 'sit', 'sitting', 'rest', 'resting'],
  emote: ['emote*', 'dance*', 'dancing', 'wave', 'waving', 'taunt*', 'cheer*', 'clap*', 'salute*', 'bow', 'bowing', 'laugh*', 'cry', 'crying', 'victory', 'celebrat*', 'thumbs', 'point', 'pointing', 'shrug*', 'nod*', 'greeting', 'hello', 'kiss*', 'flex*', 'yawn*', 'sad', 'angry', 'happy', 'thinking', 'surprised', 'talk*', 'talking'],
  interaction: ['pick*', 'open*', 'door', 'push*', 'pull*', 'carry*', 'lift*', 'press*', 'button', 'interact*', 'interaction*', 'drink*', 'eat*', 'grab*', 'use', 'lever', 'chop*', 'mine', 'mining', 'dig*', 'plant*', 'repair*'],
};

const COMPILED = (Object.entries(RULES) as [AnimationTagId, readonly string[]][]).map(([tag, rules]) => ({
  tag,
  exact: new Set(rules.filter((r) => !r.endsWith('*'))),
  prefixes: rules.filter((r) => r.endsWith('*')).map((r) => r.slice(0, -1)),
}));

/** Lower-case words of a name: camelCase and digits split, punctuation dropped. */
export function tokenise(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The tags a clip's name (and the folder it sat in) suggest, sorted and de-duplicated. */
export function autoTags(name: string, folder?: string): string[] {
  const tokens = [...tokenise(name), ...tokenise(folder ?? '')];
  const tags = new Set<string>();
  for (const { tag, exact, prefixes } of COMPILED) {
    if (tokens.some((t) => exact.has(t) || prefixes.some((p) => t.startsWith(p)))) tags.add(tag);
  }
  const words = tokenise(name);
  for (let i = 0; i + 1 < words.length; i += 1) if (words[i] === 'in' && words[i + 1] === 'place') tags.add('in-place');
  return [...tags].sort().slice(0, ANIMATION_MAX_TAGS);
}
