import { Platform } from 'react-native';

/** react-native-web has no native animated module and warns if asked for one. */
export const useNativeDriver = Platform.OS !== 'web';
