// Sign-in (Phase 146 E3/E4/E6): the device-flow code card plus the "Use a personal access token" fallback. Plain
// react-native primitives for now; the Theme F shell restyles it with ui-native components.
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../ui/theme';
import { useAuth } from './auth-context';
import { runDeviceFlow, type DeviceFlowState } from './device-flow';
import { validateToken } from './pat';

const CLIENT_ID = process.env['EXPO_PUBLIC_GITHUB_CLIENT_ID'] ?? '';

async function lookupLogin(token: string): Promise<string | null> {
  const result = await validateToken(token);
  return result.ok ? result.login : null;
}

export function SignInScreen({ notice }: { notice: string | null }) {
  const { signIn } = useAuth();
  const theme = useTheme();
  const [flow, setFlow] = useState<DeviceFlowState>({ phase: 'idle' });
  const [patOpen, setPatOpen] = useState(false);
  const [pat, setPat] = useState('');
  const [patMessage, setPatMessage] = useState<string | null>(null);
  const cancelled = useRef(false);
  const warnedFor = useRef<string | null>(null);

  // Leaving the screen (signed in, or unmounted) stops the poll loop instead of letting it run to expiry.
  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  const startDeviceFlow = useCallback(async () => {
    cancelled.current = false;
    const final = await runDeviceFlow({
      clientId: CLIENT_ID,
      fetch: (url, init) => fetch(url, init),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      cancelled: () => cancelled.current,
      onState: (state) => {
        setFlow(state);
        if (state.phase === 'awaiting-user') void WebBrowser.openBrowserAsync(state.verificationUri).catch(() => {});
      },
    });
    if (final.phase === 'done') {
      const login = await lookupLogin(final.token);
      if (login) await signIn(login, final.token);
      else setFlow({ phase: 'error', message: 'Signed in, but GitHub would not say who you are' });
    }
  }, [signIn]);

  const submitPat = useCallback(async () => {
    const result = await validateToken(pat);
    if (!result.ok) return setPatMessage(result.message);
    // Signing in unmounts this screen, so list the missing scopes first and continue on the second press.
    if (result.missingScopes && result.missingScopes.length > 0 && warnedFor.current !== pat) {
      warnedFor.current = pat;
      return setPatMessage(`This token lacks: ${result.missingScopes.join(', ')}. Press again to continue anyway.`);
    }
    await signIn(result.login, pat.trim());
  }, [pat, signIn]);

  const code = flow.phase === 'awaiting-user' || flow.phase === 'polling' ? flow : null;
  const muted = { color: theme.foreground, opacity: 0.6 } as const;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16, backgroundColor: theme.background }}>
      <Text style={{ color: theme.foreground, fontSize: 32 }}>Midnite</Text>
      {notice ? <Text style={muted}>{notice}</Text> : <Text style={muted}>Sign in with GitHub to continue.</Text>}
      {code ? (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.foreground, fontSize: 28, letterSpacing: 4 }}>{code.userCode}</Text>
          <Pressable accessibilityRole="button" onPress={() => void Clipboard.setStringAsync(code.userCode)}>
            <Text style={{ color: theme.foreground }}>Copy code</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void WebBrowser.openBrowserAsync(code.verificationUri)}>
            <Text style={{ color: theme.foreground }}>Open GitHub</Text>
          </Pressable>
          <Text style={muted}>Waiting for approval…</Text>
        </View>
      ) : (
        <Pressable accessibilityRole="button" disabled={!CLIENT_ID} onPress={() => void startDeviceFlow()}>
          <Text style={{ color: theme.foreground, opacity: CLIENT_ID ? 1 : 0.4 }}>Sign in with GitHub</Text>
        </Pressable>
      )}
      {flow.phase === 'expired' ? <Text style={muted}>The code expired. Try again.</Text> : null}
      {flow.phase === 'denied' ? <Text style={muted}>Sign-in was denied.</Text> : null}
      {flow.phase === 'error' ? <Text style={muted}>{flow.message}</Text> : null}
      {!CLIENT_ID ? <Text style={muted}>No GitHub client id is configured; use a token.</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => setPatOpen((open) => !open)}>
        <Text style={{ color: theme.foreground }}>Use a personal access token</Text>
      </Pressable>
      {patOpen ? (
        <View style={{ width: '100%', gap: 8 }}>
          <TextInput
            accessibilityLabel="Personal access token"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={pat}
            onChangeText={setPat}
            style={{ color: theme.foreground, borderWidth: 1, borderColor: theme.foreground, padding: 8 }}
          />
          <Pressable accessibilityRole="button" onPress={() => void submitPat()}>
            <Text style={{ color: theme.foreground }}>Validate and sign in</Text>
          </Pressable>
          {patMessage ? <Text style={muted}>{patMessage}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}
