import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../src/ui/theme';

export default function Home() {
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Text style={{ color: theme.foreground, fontSize: 20 }}>Midnite</Text>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
