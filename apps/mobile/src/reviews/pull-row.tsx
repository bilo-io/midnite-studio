// One pull request in the Reviews list (Phase 146 Theme I1): number and title, author, state and review-decision
// badges, the checks glyph, comment count and relative time of the last close or merge when there is one.
import { Avatar, Badge, useTheme } from '@bilo-io/ui-native';
import type { ForgePull } from '@midnite/studio-shared';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { relativeTime } from '../history/group-by-day';
import { Icon } from '../ui/icons';
import { checksGlyph, decisionBadge, isoToUnix, stateBadge } from './format';

export interface PullRowProps {
  pull: ForgePull;
  now: Date;
  onPress(n: number): void;
}

function PullRowImpl({ pull, now, onPress }: PullRowProps) {
  const theme = useTheme();
  const state = stateBadge(pull);
  const decision = decisionBadge(pull.reviewDecision);
  const checks = checksGlyph(pull.checks);
  const checkColor = pull.checks === 'passing' ? theme.colors.success : pull.checks === 'failing' ? theme.accents.kind.bug : theme.accents.status.wip;
  const ended = isoToUnix(pull.mergedAt ?? pull.closedAt);
  return (
    <Pressable
      testID={`pull-row-${pull.number}`}
      accessibilityRole="button"
      accessibilityLabel={`Pull request ${pull.number}, ${pull.title}, ${state.label}${decision ? `, ${decision.label}` : ''}`}
      onPress={() => onPress(pull.number)}
      style={({ pressed }) => [
        { padding: theme.space[4], gap: theme.space[2], borderBottomWidth: 1, borderBottomColor: theme.colors.border },
        pressed && { backgroundColor: theme.colors.accent },
      ]}
    >
      <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={[theme.type.sm, { color: theme.colors.foreground, fontWeight: theme.font.medium }]}>
        {`#${pull.number} ${pull.title}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: theme.space[2] }}>
        {pull.author ? <Avatar name={pull.author} size={24} /> : null}
        {pull.author ? <Text style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>{pull.author}</Text> : null}
        <Badge tone={state.tone}>{state.label}</Badge>
        {decision ? <Badge tone={decision.tone}>{decision.label}</Badge> : null}
        {checks ? (
          <View testID={`pull-checks-${pull.checks}`} accessibilityLabel={checks.label} accessible>
            <Icon name={checks.icon} size={14} color={checkColor} />
          </View>
        ) : null}
        {pull.commentCount > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Icon name="comment" size={12} color={theme.colors.mutedForeground} />
            <Text style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>{pull.commentCount}</Text>
          </View>
        ) : null}
        {ended ? <Text style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>{relativeTime(ended, now)}</Text> : null}
      </View>
    </Pressable>
  );
}

export const PullRow = memo(PullRowImpl);
