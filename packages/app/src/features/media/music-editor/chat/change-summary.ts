import { MUSIC_CHAT_MAX_SELECTION, type Song, type SongChatChange, type SongNote } from '@midnite/studio-shared';

import { barTicks } from '../model/song-edit';

/**
 * What an agent turn did to a song, in the terms a musician uses: which tracks, which bars, how many
 * notes — plus the indices of the notes it added, so a link in the reply can select exactly those in
 * the piano roll (Phase 101 Theme I). Pure: the chat panel diffs the song it held before the turn
 * against the one it holds after.
 */

export type ChangeSummary = {
  changes: SongChatChange[];
  /** Edits with no bar to point at: tempo, tracks added or removed, instruments. */
  extras: string[];
};

const noteKey = (n: SongNote): string => `${n.pitch}:${n.startTick}:${n.durationTicks}:${n.velocity}`;

/** The 1-based bar a tick falls in, following the song's time-signature changes. */
export function barAt(signatures: Song['timeSignatures'], tick: number): number {
  const sigs = signatures.length ? signatures : [{ tick: 0, numerator: 4, denominator: 4 as const }];
  let bar = 1;
  for (let i = 0; i < sigs.length; i += 1) {
    const sig = sigs[i]!;
    const len = barTicks(sig.numerator, sig.denominator);
    const next = sigs[i + 1];
    if (!next || tick < next.tick) return bar + Math.floor(Math.max(0, tick - sig.tick) / len);
    bar += Math.ceil((next.tick - sig.tick) / len);
  }
  return bar;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildChangeSummary(before: Song, after: Song): ChangeSummary {
  const changes: SongChatChange[] = [];
  const extras: string[] = [];
  const beforeById = new Map(before.tracks.map((t) => [t.id, t]));
  const afterIds = new Set(after.tracks.map((t) => t.id));

  for (const track of after.tracks) {
    const prev = beforeById.get(track.id);
    if (!prev) extras.push(`Added track "${track.name || track.id}"`);
    else if (prev.program !== track.program) extras.push(`Changed the instrument of "${track.name || track.id}"`);

    const oldCounts = new Map<string, number>();
    for (const n of prev?.notes ?? []) oldCounts.set(noteKey(n), (oldCounts.get(noteKey(n)) ?? 0) + 1);
    const touched: SongNote[] = [];
    const indices: number[] = [];
    track.notes.forEach((n, i) => {
      const k = noteKey(n);
      const left = oldCounts.get(k) ?? 0;
      if (left > 0) oldCounts.set(k, left - 1);
      else {
        touched.push(n);
        indices.push(i);
      }
    });
    // Whatever is left in the old multiset was removed or rewritten.
    const removedNotes: SongNote[] = [];
    const remaining = new Map(oldCounts);
    for (const n of prev?.notes ?? []) {
      const left = remaining.get(noteKey(n)) ?? 0;
      if (left > 0) {
        remaining.set(noteKey(n), left - 1);
        removedNotes.push(n);
      }
    }
    if (touched.length === 0 && removedNotes.length === 0) continue;
    const span = [...touched, ...removedNotes];
    const fromTick = Math.min(...span.map((n) => n.startTick));
    const toTick = Math.max(...span.map((n) => Math.max(n.startTick, n.startTick + n.durationTicks - 1)));
    const fromBar = barAt(after.timeSignatures, fromTick);
    changes.push({
      trackId: track.id,
      trackName: track.name || track.id,
      fromBar,
      toBar: Math.max(fromBar, barAt(after.timeSignatures, toTick)),
      added: touched.length,
      removed: removedNotes.length,
      noteIndices: indices.slice(0, MUSIC_CHAT_MAX_SELECTION),
    });
  }
  for (const track of before.tracks) if (!afterIds.has(track.id)) extras.push(`Removed track "${track.name || track.id}"`);
  const bpm = (s: Song): number | undefined => s.tempos[0]?.bpm;
  if (bpm(before) !== bpm(after)) extras.push(`Set the tempo to ${bpm(after)} BPM`);
  return { changes, extras };
}

export const barRange = (c: Pick<SongChatChange, 'fromBar' | 'toBar'>): string =>
  c.fromBar === c.toBar ? `bar ${c.fromBar}` : `bars ${c.fromBar}–${c.toBar}`;

/** One line per change, for the reply's text and for a screen reader. */
export function describeChange(c: SongChatChange): string {
  const parts: string[] = [];
  if (c.added) parts.push(`+${plural(c.added, 'note')}`);
  if (c.removed) parts.push(`−${plural(c.removed, 'note')}`);
  return `**${c.trackName}**, ${barRange(c)} (${parts.join(', ')})`;
}

/** The markdown of an assistant reply: the agent's own words, then what actually changed. */
export function replyText(agentSummary: string, summary: ChangeSummary): string {
  const lines: string[] = [];
  if (agentSummary.trim()) lines.push(agentSummary.trim());
  if (summary.changes.length || summary.extras.length) {
    lines.push('**What changed**');
    for (const c of summary.changes) lines.push(`- ${describeChange(c)}`);
    for (const e of summary.extras) lines.push(`- ${e}`);
  } else if (!agentSummary.trim()) {
    lines.push('The song did not change.');
  }
  return lines.join('\n\n').replace(/\n\n- /g, '\n- ');
}
