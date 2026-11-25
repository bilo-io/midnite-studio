// The sticky review bar and its sheet (Phase 146 Theme I5): Approve, Request changes and Comment, each opening a bottom
// sheet with an optional body (required for Request changes and Comment) that goes to `submitReview`. Disabled with an
// explanation on the viewer's own PR and on merged or closed PRs. A success banner is shown by the caller.
import { Button, Input, Sheet, useTheme } from '@bilo-io/ui-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { reviewBodyRequired, type ReviewAction } from './format';

const COPY: Record<ReviewAction, { title: string; submit: string }> = {
  APPROVE: { title: 'Approve', submit: 'Approve' },
  REQUEST_CHANGES: { title: 'Request changes', submit: 'Request changes' },
  COMMENT: { title: 'Comment', submit: 'Comment' },
};

export interface ReviewBarProps {
  /** Why the bar is disabled, or null when the viewer may review. */
  blockedReason: string | null;
  pending: boolean;
  error: string | null;
  /** Called when a sheet opens, so a stale error from the last attempt is cleared. */
  onOpen?(): void;
  onSubmit(action: ReviewAction, body: string): Promise<boolean>;
}

export function ReviewBar({ blockedReason, pending, error, onOpen, onSubmit }: ReviewBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [body, setBody] = useState('');
  const disabled = blockedReason !== null;
  const required = action ? reviewBodyRequired(action) : false;
  const canSend = !pending && (!required || body.trim().length > 0);

  const send = async () => {
    if (!action || !canSend) return;
    if (await onSubmit(action, body.trim())) {
      setAction(null);
      setBody('');
    }
  };
  const openSheet = (a: ReviewAction) => {
    setBody('');
    onOpen?.();
    setAction(a);
  };

  return (
    <>
      <View
        testID="review-bar"
        style={[
          { padding: theme.space[3], paddingBottom: theme.space[3] + insets.bottom, gap: theme.space[2], backgroundColor: theme.colors.popover, borderTopWidth: 1, borderTopColor: theme.colors.border },
          theme.elevation[2],
        ]}
      >
        {blockedReason ? (
          <Text testID="review-blocked" style={[theme.type.xs, { color: theme.colors.mutedForeground }]}>
            {blockedReason}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: theme.space[2] }}>
          <Button testID="review-comment" variant="outline" disabled={disabled} onPress={() => openSheet('COMMENT')} style={{ flex: 1 }}>
            Comment
          </Button>
          <Button testID="review-request-changes" variant="outline" disabled={disabled} onPress={() => openSheet('REQUEST_CHANGES')} style={{ flex: 1 }}>
            Request changes
          </Button>
          <Button testID="review-approve" disabled={disabled} onPress={() => openSheet('APPROVE')} style={{ flex: 1 }}>
            Approve
          </Button>
        </View>
      </View>
      <Sheet open={action !== null} onOpenChange={(o) => !o && setAction(null)} side="bottom" title={action ? COPY[action].title : ''} snapPoints={[0.5, 0.9]} insetBottom={insets.bottom} testID="review-sheet">
        <View style={{ padding: theme.space[4], gap: theme.space[3] }}>
          <Input
            testID="review-body"
            value={body}
            onChangeText={setBody}
            multiline
            placeholder={required ? 'Leave a comment (required)' : 'Leave a comment (optional)'}
            accessibilityLabel="Review comment"
          />
          {error ? (
            <Text testID="review-error" style={[theme.type.xs, { color: theme.accents.kind.bug }]}>
              {error}
            </Text>
          ) : null}
          <Button
            testID="review-submit"
            variant={action === 'REQUEST_CHANGES' ? 'destructive' : 'default'}
            disabled={!canSend}
            loading={pending}
            onPress={() => void send()}
          >
            {action ? COPY[action].submit : ''}
          </Button>
        </View>
      </Sheet>
    </>
  );
}
