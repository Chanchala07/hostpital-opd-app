import { AppState } from 'react-native';

/**
 * True unless the app is in the background. (At start-up the state can be
 * "unknown" for a moment; polling should still run then.)
 */
export const appInForeground = () => AppState.currentState !== 'background';
