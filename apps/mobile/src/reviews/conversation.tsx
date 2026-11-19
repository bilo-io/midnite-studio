// The Conversation tab (Phase 146 Theme I3): PR comments and review threads in time order. A thread shows `path:line`,
// a six-line hunk excerpt in the diff viewer's compact mode, its comments and a reply composer; resolved threads
// collapse under "N resolved". A general comment composer sits at the bottom.
import { Avatar, Button, Input, useTheme } from '@bilo-io/ui-native';
import type { ForgeReviewThread } from '@midnite/studio-shared';
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { DiffView } from '../diff/diff-view';
import { excerptOf, fileFromHunkText } from '../diff/diff-rows';
import type { PullComment } from '../data/source';
import { isoToUnix } from './format';
import { formatDateTime } from '../history/group-by-day';

export type ConversationItem =
  | { kind: 'comment'; key: string; at: number; comment: PullComment }
  | { kind: 'thread'; key: string; at: number; thread: ForgeReviewThread };

/** Comments and unresolved threads in time order (a thread sorts by its first comment); resolved threads come back apart. */
export function buildConversation(comments: readonly PullComment[], threads: readonly ForgeReviewThread[]) {
  const items: ConversationItem[] = [
    ...comments.map((comment): ConversationItem => ({ kind: 'comment', key: `c:${comment.id}`, at: isoToUnix(comment.createdAt), comment })),
    ...threads
      .filter((t) => !t.resolved)
      .map((thread): ConversationItem => ({ kind: 'thread', key: `t:${thread.id}`, at: isoToUnix(thread.comments[0]?.createdAt), thread })),
  ].sort((a, b) => a.at - b.at);
  return { items, resolved: threads.filter((t) => t.resolved) };
}

export const threadLabel = (t: Pick<ForgeReviewThread, 'path' | 'line' | 'originalLine' | 'outdated' | 'fileLevel'>): string => {
  const line = t.line ?? t.originalLine;
  return `${t.path}${t.fileLevel || line === null ? '' : `:${line}`}${t.outdated ? ' (outdated)' : ''}`;
};

export interface ConversationProps {
  comments: readonly PullComment[];
  threads: readonly ForgeReviewThread[];
  canWrite: boolean;
  onReply(threadId: string, body: string): Promise<boolean>;
  onComment(body: string): Promise<boolean>;
}

export function ConversationTab({ comments, threads, canWrite, onReply, onComment }: ConversationProps) {
  const theme = useTheme();
  const { items, resolved } = useMemo(() => buildConversation(comments, threads), [comments, threads]);
  const [showResolved, setShowResolved] = useState(false);
  return (
    <View testID="conversation" style={{ padding: theme.space[4], gap: theme.space[4] }}>
      {items.length === 0 && resolved.length === 0 ? (
        <Text style={[theme.type.sm, { color: theme.colors.mutedForeground }]}>No conversation yet.</Text>
      ) : null}
      {items.map((item) =>
        item.kind === 'comment' ? (
          <CommentBlock key={item.key} author={item.comment.author} body={item.comment.body} at={item.comment.createdAt} />
        ) : (
          <ThreadBlock key={item.key} thread={item.thread} canWrite={canWrite} onReply={onReply} />
        ),
      )}
      {resolved.length > 0 ? (
        <View style={{ gap: theme.space[3] }}>
          <Button testID="resolved-toggle" variant="ghost" size="sm" onPress={() => setShowResolved((s) => !s)}>
            {`${resolved.length} resolved`}
          </Button>
          {showResolved ? resolved.map((t) => <ThreadBlock key={t.id} thread={t} canWrite={false} onReply={onReply} />) : null}
        </View>
      ) : null}
      {canWrite ? <Composer testID="comment" placeholder="Add a comment" submit="Comment" onSend={onComment} /> : null}
    </View>
  );
}

function CommentBlock({ author, body, at }: { author: string; body: string; at: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.space[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
        <Avatar name={author || '?'} size={24} />
        <Text style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>{`${author || 'unknown'} · ${formatDateTime(isoToUnix(at))}`}</Text>
      </View>
      <Text selectable style={[theme.type.sm, { color: theme.colors.foreground }]}>{body}</Text>
    </View>
  );
}

function ThreadBlock({ thread, canWrite, onReply }: { thread: ForgeReviewThread; canWrite: boolean; onReply: ConversationProps['onReply'] }) {
  const theme = useTheme();
  const excerpt = useMemo(() => {
    const file = fileFromHunkText(thread.path, thread.comments[0]?.diffHunk ?? '');
    return file ? excerptOf(file, 6) : null;
  }, [thread]);
  return (
    <View
      testID={`thread-${thread.id}`}
      style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, overflow: 'hidden' }}
    >
      <Text numberOfLines={1} style={[theme.type.xs, { fontFamily: theme.font.mono, padding: theme.space[2], backgroundColor: theme.colors.muted, color: theme.colors.mutedForeground }]}>
        {threadLabel(thread)}
      </Text>
      {excerpt ? <DiffView file={excerpt} compact /> : null}
      <View style={{ padding: theme.space[3], gap: theme.space[3] }}>
        {thread.comments.map((c) => (
          <CommentBlock key={c.id} author={c.author} body={c.body} at={c.createdAt} />
        ))}
        {canWrite && !thread.resolved ? (
          <Composer testID={`reply-${thread.id}`} placeholder="Reply" submit="Reply" onSend={(body) => onReply(thread.id, body)} />
        ) : null}
      </View>
    </View>
  );
}

function Composer({ testID, placeholder, submit, onSend }: { testID: string; placeholder: string; submit: string; onSend(body: string): Promise<boolean> }) {
  const theme = useTheme();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    const sent = await onSend(body.trim());
    setBusy(false);
    if (sent) setBody('');
  };
  return (
    <View style={{ gap: theme.space[2] }}>
      <Input testID={`${testID}-input`} value={body} onChangeText={setBody} multiline placeholder={placeholder} accessibilityLabel={placeholder} />
      <Button testID={`${testID}-send`} size="sm" disabled={!body.trim() || busy} loading={busy} onPress={() => void send()}>
        {submit}
      </Button>
    </View>
  );
}
