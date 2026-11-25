import { View, type ViewProps } from 'react-native';

export function GestureHandlerRootView(props: ViewProps) {
  return <View {...props} />;
}

// Theme H: gestures are inert in jsdom; the graph's maths is tested as pure functions.
type Chain = { [k: string]: (...args: unknown[]) => Chain };
const chain = (): Chain => new Proxy({} as Chain, { get: () => () => chain() });
export const Gesture = { Pinch: chain, Pan: chain, Simultaneous: chain };
export function GestureDetector({ children }: { gesture?: unknown; children?: React.ReactNode }) {
  return <>{children}</>;
}
