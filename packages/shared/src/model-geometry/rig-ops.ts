import type { ModelSpec } from '../media-model';
import {
  type ModelAnatomy,
  type ModelBone,
  type ModelClip,
  type ModelClipOp,
  ModelClipSchema,
  type ModelFacing,
  type ModelRig,
  type ModelRigOp,
  MODEL_BONE_TABLE,
  MODEL_CLIP_PRESETS,
  MODEL_MAX_BONES,
  MODEL_MAX_CLIPS,
} from '../media-model-rig';
import { retargetClips } from './clips';
import { autoRig, resolveRig, validateRig } from './rig';

/**
 * Edits to a design's anatomy, rig and clips — one pure implementation behind the editor's rig and
 * clip panels and the `model_auto_rig` / `model_patch_rig` / `model_patch_animations` /
 * `model_retarget` MCP tools, so an edit means the same thing whoever makes it. Each takes a design
 * and answers the new design or `{path, message}` issues; nothing is half-applied.
 */

export type RigEditIssue = { opIndex?: number; path: string; message: string };
export type RigEditOutcome = { ok: true; spec: ModelSpec } | { ok: false; errors: RigEditIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Drop keys and bindings that name bones the rig no longer has. */
function pruneToRig(spec: ModelSpec): ModelSpec {
  const names = new Set(spec.rig?.bones.map((b) => b.name) ?? []);
  const bind = spec.rig?.bind ? Object.fromEntries(Object.entries(spec.rig.bind).filter(([, bone]) => names.has(bone))) : undefined;
  const animations = spec.animations?.map((clip) => {
    if (!clip.keys) return clip;
    const keys = clip.keys.filter((k) => names.has(k.bone));
    return keys.length === clip.keys.length ? clip : { ...clip, keys };
  });
  return {
    ...spec,
    ...(spec.rig ? { rig: { ...spec.rig, ...(bind ? { bind } : {}) } } : {}),
    ...(animations ? { animations } : {}),
  };
}

const issuesUnder = (spec: ModelSpec, prefix: string): RigEditIssue[] => validateRig(spec).filter((i) => i.path.startsWith(prefix));

/**
 * Sets the anatomy and places a fresh rig for it (`static` removes the rig and the clips). Clips
 * whose kind the new anatomy does not offer are dropped; keys on bones it lacks go with them.
 */
export function setAnatomy(spec: ModelSpec, anatomy: ModelAnatomy, facing?: ModelFacing): RigEditOutcome {
  if (anatomy === 'static') {
    const { rig: _rig, animations: _animations, ...rest } = spec;
    void _rig;
    void _animations;
    return { ok: true, spec: { ...rest, anatomy: 'static' } };
  }
  const rig = autoRig(spec, anatomy, facing);
  if (!rig || rig.bones.length === 0) return { ok: false, errors: [{ path: 'anatomy', message: `Could not place a ${anatomy} rig on this design.` }] };
  const presets = MODEL_CLIP_PRESETS[anatomy];
  const animations = (spec.animations ?? []).filter((clip) => clip.kind === 'custom' || presets.includes(clip.kind));
  return { ok: true, spec: pruneToRig({ ...spec, anatomy, rig, ...(animations.length > 0 ? { animations } : { animations: undefined }) }) };
}

/** Applies rig ops in order; any failing op, or a rig left invalid, rejects the whole call. */
export function applyRigOps(spec: ModelSpec, ops: readonly ModelRigOp[]): RigEditOutcome {
  const anatomy = spec.anatomy ?? 'static';
  if (anatomy === 'static') return { ok: false, errors: [{ path: 'anatomy', message: 'A static object has no rig — set the anatomy (model_auto_rig) first.' }] };
  const table = MODEL_BONE_TABLE[anatomy];
  let rig: ModelRig = spec.rig ? { ...spec.rig, bones: [...spec.rig.bones], ...(spec.rig.bind ? { bind: { ...spec.rig.bind } } : {}) } : { bones: [] };
  const errors: RigEditIssue[] = [];
  const fail = (opIndex: number, path: string, message: string): void => void errors.push({ opIndex, path, message });

  ops.forEach((op, opIndex) => {
    switch (op.op) {
      case 'setBone': {
        if (!table.some((t) => t.name === op.name)) {
          return fail(opIndex, 'name', `"${op.name}" is not a ${anatomy} bone name. Valid names: ${table.map((t) => t.name).join(', ')}.`);
        }
        const at = rig.bones.findIndex((b) => b.name === op.name);
        const prev: Partial<ModelBone> = at >= 0 ? rig.bones[at]! : {};
        const head = op.head ?? prev.head;
        const tail = op.tail ?? prev.tail;
        if (!head || !tail) return fail(opIndex, 'head', `A new bone "${op.name}" needs both "head" and "tail".`);
        const next: ModelBone = { name: op.name, head, tail };
        const parent = op.parent === undefined ? prev.parent : op.parent ?? undefined;
        if (parent !== undefined) next.parent = parent;
        if (at < 0 && rig.bones.length >= MODEL_MAX_BONES) return fail(opIndex, 'name', `A rig holds at most ${MODEL_MAX_BONES} bones.`);
        rig = { ...rig, bones: at >= 0 ? rig.bones.map((b, i) => (i === at ? next : b)) : [...rig.bones, next] };
        return;
      }
      case 'removeBone': {
        if (!rig.bones.some((b) => b.name === op.name)) return fail(opIndex, 'name', `No bone is named "${op.name}".`);
        // Children of a removed bone fall back to its parent (the table's, when it had none of its own).
        rig = {
          ...rig,
          bones: rig.bones.filter((b) => b.name !== op.name).map((b) => (b.parent === op.name ? { name: b.name, head: b.head, tail: b.tail } : b)),
        };
        return;
      }
      case 'bind': {
        const bind = { ...(rig.bind ?? {}) };
        if (op.bone === null) delete bind[op.part];
        else bind[op.part] = op.bone;
        rig = { ...rig, bind };
        return;
      }
      case 'falloff':
        rig = { ...rig, falloff: op.value };
        return;
      case 'facing':
        rig = { ...rig, facing: op.value };
        return;
    }
  });
  if (errors.length > 0) return { ok: false, errors };
  const next = pruneToRig({ ...spec, rig });
  const invalid = issuesUnder(next, 'rig');
  return invalid.length > 0 ? { ok: false, errors: invalid } : { ok: true, spec: next };
}

/** Applies clip ops in order; a clip that fails the schema, or a clip set left invalid, rejects the call. */
export function applyClipOps(spec: ModelSpec, ops: readonly ModelClipOp[]): RigEditOutcome {
  let clips: ModelClip[] = [...(spec.animations ?? [])];
  const errors: RigEditIssue[] = [];
  const fail = (opIndex: number, path: string, message: string): void => void errors.push({ opIndex, path, message });
  const indexOf = (name: string): number => clips.findIndex((c) => c.name === name);
  const noClip = (opIndex: number, name: string): void =>
    fail(opIndex, 'name', `No clip is named "${name}". Clips: ${clips.map((c) => c.name).join(', ') || '(none)'}.`);

  ops.forEach((op, opIndex) => {
    if (op.op === 'add') {
      const raw = isRecord(op.clip) && op.clip.name === undefined && typeof op.clip.kind === 'string' ? { ...op.clip, name: op.clip.kind } : op.clip;
      const parsed = ModelClipSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) fail(opIndex, ['clip', ...issue.path].join('.'), issue.message);
        return;
      }
      if (indexOf(parsed.data.name) >= 0) return fail(opIndex, 'clip.name', `Another clip is already called "${parsed.data.name}".`);
      if (clips.length >= MODEL_MAX_CLIPS) return fail(opIndex, 'clip', `A design holds at most ${MODEL_MAX_CLIPS} clips.`);
      clips = [...clips, parsed.data];
      return;
    }
    const at = indexOf(op.name);
    if (at < 0) return noClip(opIndex, op.name);
    const clip = clips[at]!;
    if (op.op === 'remove') {
      clips = clips.filter((_, i) => i !== at);
      return;
    }
    if (op.op === 'update') {
      const merged: Record<string, unknown> = { ...clip };
      for (const [key, value] of Object.entries(op.fields)) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      const parsed = ModelClipSchema.safeParse(merged);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) fail(opIndex, ['fields', ...issue.path].join('.'), issue.message);
        return;
      }
      if (parsed.data.name !== op.name && indexOf(parsed.data.name) >= 0) return fail(opIndex, 'fields.name', `Another clip is already called "${parsed.data.name}".`);
      clips = clips.map((c, i) => (i === at ? parsed.data : c));
      return;
    }
    if (op.op === 'setKeys') {
      const same = (a: { bone: string; time: number }, b: { bone: string; time: number }): boolean => a.bone === b.bone && Math.abs(a.time - b.time) < 1e-4;
      const kept = (clip.keys ?? []).filter((k) => !op.keys.some((n) => same(k, n)));
      const keys = [...kept, ...op.keys].sort((a, b) => a.time - b.time || a.bone.localeCompare(b.bone));
      const parsed = ModelClipSchema.safeParse({ ...clip, keys });
      if (!parsed.success) return fail(opIndex, 'keys', parsed.error.issues[0]?.message ?? 'Too many keys.');
      clips = clips.map((c, i) => (i === at ? parsed.data : c));
      return;
    }
    // clearKeys
    const keys = op.bone === undefined ? [] : (clip.keys ?? []).filter((k) => k.bone !== op.bone);
    const { keys: _old, ...rest } = clip;
    void _old;
    clips = clips.map((c, i) => (i === at ? (keys.length > 0 ? { ...rest, keys } : rest) : c));
  });
  if (errors.length > 0) return { ok: false, errors };
  const next: ModelSpec = { ...spec, animations: clips.length > 0 ? clips : undefined };
  const invalid = issuesUnder(next, 'animations');
  return invalid.length > 0 ? { ok: false, errors: invalid } : { ok: true, spec: next };
}

/**
 * Copies `from`'s clips onto `to` (retargeted by canonical bone name, root motion scaled by leg
 * length). Kinds `to`'s anatomy does not offer are skipped; a clip whose name is taken replaces the
 * old one when `replace`, and is renamed `<name> 2` otherwise.
 */
export function copyClips(from: ModelSpec, to: ModelSpec, replace = false): RigEditOutcome & { skipped?: string[] } {
  const source = resolveRig(from);
  const target = resolveRig(to);
  if (!source || !(from.animations?.length)) return { ok: false, errors: [{ path: 'from', message: 'The source model has no rig or no clips to copy.' }] };
  if (!target) return { ok: false, errors: [{ path: 'rig', message: 'This model has no rig yet — set its anatomy (model_auto_rig) first.' }] };
  const presets = MODEL_CLIP_PRESETS[target.anatomy];
  const skipped: string[] = [];
  const usable = from.animations.filter((clip) => {
    const ok = clip.kind === 'custom' || presets.includes(clip.kind);
    if (!ok) skipped.push(clip.name);
    return ok;
  });
  let clips = [...(to.animations ?? [])];
  for (const clip of retargetClips(source, target, usable)) {
    const at = clips.findIndex((c) => c.name === clip.name);
    if (at >= 0 && replace) clips = clips.map((c, i) => (i === at ? clip : c));
    else if (at >= 0) {
      let n = 2;
      while (clips.some((c) => c.name === `${clip.name} ${n}`)) n += 1;
      clips.push({ ...clip, name: `${clip.name} ${n}` });
    } else clips.push(clip);
  }
  if (clips.length > MODEL_MAX_CLIPS) return { ok: false, errors: [{ path: 'animations', message: `A design holds at most ${MODEL_MAX_CLIPS} clips; this would make ${clips.length}.` }] };
  const next = pruneToRig({ ...to, animations: clips });
  const invalid = issuesUnder(next, 'animations');
  return invalid.length > 0 ? { ok: false, errors: invalid } : { ok: true, spec: next, ...(skipped.length > 0 ? { skipped } : {}) };
}
