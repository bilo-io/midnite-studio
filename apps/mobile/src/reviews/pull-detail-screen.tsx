// Pull request detail (Phase 146 Theme I2): header, then Overview / Files / Conversation tabs, with the review bar
// pinned below. Overview shows the body, reviewers and the checks list (a check opens its details URL in the in-app
// browser); Files lists changed files and opens the shared diff viewer; Conversation is I3. The back arrow closes an
// open file diff first, then leaves.
import { AppBar, Badge, EmptyState, IconButton, ListRow, Skeleton, Tabs, useTheme } from '@bilo-io/ui-native';
import type { FileDiff } from '@midnite/studio-shared';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SourceError,
  useCommentPull,
  usePull,
  usePullFiles,
  usePullOverview,
  usePullThreads,
  useReplyToThread,
  useSubmitReview,
  useViewer,
} from '../data/queries';
import { DiffView } from '../diff/diff-view';
import { useCurrentRepo } from '../shell/use-current-repo';
import { Icon } from '../ui/icons';
import { useLayoutClass } from '../ui/layout-class';
import { ConversationTab } from './conversation';
import { checkGlyphOf, decisionBadge, isHttpsUrl, reviewBlockedReason, reviewerLabel, stateBadge, type ReviewAction } from './format';
import { ReviewBar } from './review-bar';

/** The expanded layout's file list column (L6). */
export const FILE_LIST_WIDTH = 320;

type DetailTab = 'overview' | 'files' | 'conversation';

const SUBMITTED: Record<ReviewAction, string> = {
  APPROVE: 'Approved this pull request.',
  REQUEST_CHANGES: 'Requested changes.',
  COMMENT: 'Review comment submitted.',
};

export function PullDetailScreen({ n }: { n: number }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { repo } = useCurrentRepo();
  const pull = usePull(repo, n);
  const overview = usePullOverview(repo, n);
  const files = usePullFiles(repo, n);
  const threads = usePullThreads(repo, n);
  const viewer = useViewer();
  const submit = useSubmitReview();
  const comment = useCommentPull();
  const reply = useReplyToThread();
  const [tab, setTab] = useState<DetailTab>('overview');
  const [file, setFile] = useState<FileDiff | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  // On an expanded window the file list sits beside the diff (320dp column) instead of the diff replacing the screen.
  const split = useLayoutClass() === 'expanded';
  const { height: windowHeight } = useWindowDimensions();
  const back = () => (file && !split ? setFile(null) : router.back());
  const detail = pull.data;
  const state = detail ? stateBadge(detail.pull) : null;
  const bar = (
    <AppBar
      testID="pull-bar"
      insetTop={insets.top}
      leading={<IconButton icon={<Icon name="chevronLeft" color={theme.colors.foreground} />} label="Back" size={40} onPress={back} />}
      title={file ? file.path : `#${n}`}
      trailing={!file && state ? <Badge tone={state.tone}>{state.label}</Badge> : undefined}
    />
  );
  const frame = { flex: 1, backgroundColor: theme.colors.background } as const;

  if (!repo) {
    return (
      <View style={frame}>
        {bar}
        <EmptyState testID="pull-no-repo" title="Pick a repository" body="Choose a repository to open this pull request." />
      </View>
    );
  }
  if (pull.isPending) {
    return (
      <View style={frame}>
        {bar}
        <View testID="pull-skeleton" style={{ padding: theme.space[4], gap: theme.space[3] }}>
          <Skeleton width="80%" height={20} />
          <Skeleton width="50%" height={12} />
          <Skeleton width="100%" height={48} />
        </View>
      </View>
    );
  }
  if (!detail) {
    const offline = pull.error instanceof SourceError && pull.error.kind === 'network';
    return (
      <View style={frame}>
        {bar}
        <EmptyState
          testID="pull-error"
          title={offline ? 'You appear to be offline' : 'Could not load pull request'}
          body={pull.error instanceof Error ? pull.error.message : undefined}
          action={{ label: 'Retry', onPress: () => void pull.refetch() }}
        />
      </View>
    );
  }
  if (file && !split) {
    return (
      <View style={frame}>
        {bar}
        <DiffView file={file} />
      </View>
    );
  }

  const p = detail.pull;
  const blocked = reviewBlockedReason(p, viewer.data?.login ?? null);
  const decision = decisionBadge(p.reviewDecision);
  const failure = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');

  const submitReview = async (action: ReviewAction, body: string) => {
    setWriteError(null);
    try {
      await submit.mutateAsync({ repo, n, event: action, body });
      setBanner(SUBMITTED[action]);
      return true;
    } catch (e) {
      setWriteError(failure(e));
      return false;
    }
  };
  const attempt = async (run: () => Promise<unknown>) => {
    try {
      await run();
      return true;
    } catch (e) {
      setBanner(failure(e));
      return false;
    }
  };

  return (
    <View style={frame}>
      {bar}
      {banner ? (
        <Text testID="review-banner" accessibilityLiveRegion="polite" onPress={() => setBanner(null)} style={[theme.type.sm, { padding: theme.space[3], color: theme.colors.foreground, backgroundColor: theme.colors.accent }]}>
          {banner}
        </Text>
      ) : null}
      <ScrollView testID="pull-detail" style={{ flex: 1 }}>
        <View style={{ padding: theme.space[4], gap: theme.space[2] }}>
          <Text selectable maxFontSizeMultiplier={1.4} style={[theme.type.lg, { color: theme.colors.foreground, fontWeight: theme.font.semibold }]}>
            {p.title}
          </Text>
          <Text style={[theme.type.xs, { fontFamily: theme.font.mono, color: theme.colors.mutedForeground }]}>
            {`${p.headBranch} → ${detail.baseBranch || 'base'} · ${p.author || 'unknown'}`}
          </Text>
          {decision ? (
            <View style={{ flexDirection: 'row' }}>
              <Badge tone={decision.tone}>{decision.label}</Badge>
            </View>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: theme.space[4] }}>
          <Tabs<DetailTab>
            accessibilityLabel="Pull request sections"
            stretch
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'files', label: `Files${files.data ? ` ${files.data.length}` : ''}` },
              { value: 'conversation', label: `Conversation${threads.data && overview.data ? ` ${threads.data.length + overview.data.comments.length}` : ''}` },
            ]}
          />
        </View>
        {tab === 'overview' ? (
          <View testID="pull-overview">
            <Text selectable style={[theme.type.sm, { color: theme.colors.foreground, padding: theme.space[4] }]}>
              {detail.body.trim() || 'No description.'}
            </Text>
            <Label>Reviewers</Label>
            {overview.data?.reviewers.length ? (
              overview.data.reviewers.map((r) => <ListRow key={r.login} testID={`reviewer-${r.login}`} title={r.login} meta={reviewerLabel(r.state)} />)
            ) : (
              <Muted>{overview.isPending ? 'Loading…' : 'No reviewers.'}</Muted>
            )}
            <Label>Checks</Label>
            {overview.data?.checks.length ? (
              overview.data.checks.map((c) => (
                <ListRow
                  key={c.name}
                  testID={`check-${c.name}`}
                  title={c.name}
                  subtitle={c.conclusion}
                  leading={
                    <Icon
                      name={checkGlyphOf(c.conclusion)}
                      size={16}
                      color={c.conclusion === 'failure' ? theme.accents.kind.bug : c.conclusion === 'pending' ? theme.accents.status.wip : theme.colors.success}
                    />
                  }
                  onPress={isHttpsUrl(c.detailsUrl) ? () => void WebBrowser.openBrowserAsync(c.detailsUrl!).catch(() => {}) : undefined}
                />
              ))
            ) : (
              <Muted>{overview.isPending ? 'Loading…' : 'No checks.'}</Muted>
            )}
          </View>
        ) : null}
        {tab === 'files' ? (
          <View testID="pull-files" style={split ? { flexDirection: 'row', height: Math.max(windowHeight - 280, 320) } : undefined}>
            <View testID={split ? 'pull-files-list' : undefined} style={split ? { width: FILE_LIST_WIDTH } : undefined}>
              {files.isPending ? <Muted>Loading…</Muted> : null}
              {files.isError ? <Muted>Could not load files.</Muted> : null}
              {files.data?.map((f) => (
                <ListRow
                  key={f.path}
                  testID={`file-${f.path}`}
                  title={f.path}
                  numberOfLines={2}
                  subtitle={f.change === 'renamed' && f.oldPath ? `from ${f.oldPath}` : undefined}
                  meta={f.binary ? 'binary' : `+${f.insertions} −${f.deletions}`}
                  onPress={() => setFile(f)}
                />
              ))}
            </View>
            {split ? (
              <View testID="pull-files-diff" style={{ flex: 1 }}>
                {file ? <DiffView file={file} /> : <Muted>Select a file to see its diff.</Muted>}
              </View>
            ) : null}
          </View>
        ) : null}
        {tab === 'conversation' ? (
          threads.isPending || overview.isPending ? (
            <Muted>Loading…</Muted>
          ) : (
            <ConversationTab
              comments={overview.data?.comments ?? []}
              threads={threads.data ?? []}
              canWrite={p.state === 'open'}
              onReply={(threadId, body) => attempt(() => reply.mutateAsync({ threadId, body }))}
              onComment={(body) => attempt(() => comment.mutateAsync({ repo, n, body }))}
            />
          )
        ) : null}
      </ScrollView>
      <ReviewBar blockedReason={blocked} pending={submit.isPending} error={writeError} onOpen={() => setWriteError(null)} onSubmit={submitReview} />
    </View>
  );
}

function Label({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[theme.type.xs, { color: theme.colors.mutedForeground, fontWeight: theme.font.semibold, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: theme.space[4], paddingTop: theme.space[3], paddingBottom: theme.space[1] }]}
    >
      {children}
    </Text>
  );
}

function Muted({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[theme.type.sm, { color: theme.colors.mutedForeground, padding: theme.space[4] }]}>{children}</Text>;
}
