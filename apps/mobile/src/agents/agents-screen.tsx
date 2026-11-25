// The Agents tab (Phase 146 J2/J3): one card per provider, the last-used one first. "Open" presents the provider's own
// web app in the system's in-app browser. The FAB's "Open agent" arrives here with `?open=<provider>` and opens it.
import { Badge, Button, Card, CardContent, IconButton, useTheme } from '@bilo-io/ui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { usePrefs } from '../state/prefs';
import { Icon } from '../ui/icons';
import { openProvider, providerFromParam } from './open-provider';
import { orderProviders, type AgentProvider } from './providers';

export function AgentsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ open?: string }>();
  const lastProvider = usePrefs((s) => s.lastProvider);
  const seenHint = usePrefs((s) => s.seenAgentHint);
  const hydrated = usePrefs((s) => s.hydrated);
  const [failed, setFailed] = useState<string | null>(null);

  const open = useCallback(
    async (provider: AgentProvider) => {
      setFailed(null);
      usePrefs.getState().setSeenAgentHint(true);
      const result = await openProvider(provider, theme.colors);
      if (!result.ok) setFailed(provider.label);
    },
    [theme.colors],
  );

  // `?open=` opens once, then the param is cleared so the tab (which stays mounted) opens again the next time the FAB
  // sends the same provider. An unknown id is ignored.
  const handled = useRef<string | null>(null);
  const requested = typeof params.open === 'string' ? params.open : undefined;
  useEffect(() => {
    if (!requested) {
      handled.current = null;
      return;
    }
    if (handled.current === requested) return;
    handled.current = requested;
    const provider = providerFromParam(requested);
    if (provider) void open(provider);
    router.setParams({ open: undefined });
  }, [requested, open, router]);

  const ordered = orderProviders(lastProvider);
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.space[4], gap: theme.space[3] }}
    >
      {hydrated && !seenHint ? (
        <View
          testID="agent-hint"
          style={{
            backgroundColor: theme.colors.accent,
            borderRadius: theme.radius.lg,
            padding: theme.space[4],
            flexDirection: 'row',
            gap: theme.space[3],
          }}
        >
          <Icon name="info" size={20} color={theme.colors.foreground} />
          <Text style={[theme.type.sm, { flex: 1, color: theme.colors.foreground }]}>
            You sign in on the provider's own page, so Google and Apple sign-in work there. The session stays signed in
            across launches.
          </Text>
          <IconButton
            icon={<Icon name="close" size={16} color={theme.colors.foreground} />}
            label="Dismiss hint"
            size={32}
            onPress={() => usePrefs.getState().setSeenAgentHint(true)}
          />
        </View>
      ) : null}
      {failed ? (
        <View
          testID="agent-open-error"
          accessibilityRole="alert"
          style={{ backgroundColor: theme.alpha('destructive', 0.15), borderRadius: theme.radius.md, padding: theme.space[3] }}
        >
          <Text style={[theme.type.sm, { color: theme.colors.foreground }]}>{`Couldn't open ${failed}`}</Text>
        </View>
      ) : null}
      {ordered.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          lastUsed={provider.id === lastProvider}
          onOpen={() => void open(provider)}
        />
      ))}
    </ScrollView>
  );
}

function ProviderCard({ provider, lastUsed, onOpen }: { provider: AgentProvider; lastUsed: boolean; onOpen: () => void }) {
  const theme = useTheme();
  return (
    <Card testID={`provider-${provider.id}`} style={{ borderRadius: theme.radius.lg }}>
      <CardContent style={{ gap: theme.space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[3] }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.muted,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={provider.icon} size={20} color={theme.colors.foreground} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[theme.type.base, { color: theme.colors.foreground, fontWeight: theme.font.semibold }]}>
              {provider.label}
            </Text>
            <Text style={[theme.type.sm, { color: theme.colors.mutedForeground }]}>{provider.blurb}</Text>
          </View>
          {lastUsed ? <Badge tone="primary">Last used</Badge> : null}
        </View>
        <Button variant="outline" onPress={onOpen} accessibilityLabel={`Open ${provider.label}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space[2] }}>
            <Text style={[theme.type.sm, { color: theme.colors.foreground, fontWeight: theme.font.medium }]}>Open</Text>
            <Icon name="externalLink" size={14} color={theme.colors.foreground} />
          </View>
        </Button>
      </CardContent>
    </Card>
  );
}
