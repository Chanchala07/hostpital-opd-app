import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors } from '../theme/colors';

/** Centered spinner with a caption, for a screen's first load. */
export function LoadingView({
  label = 'Loading…',
  testID = 'loading',
}: {
  label?: string;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.center}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

/** Why it failed + "Try again". */
export function ErrorView({
  message,
  onRetry,
  testID = 'load-error',
}: {
  message: string;
  onRetry: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.center}>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        testID={`${testID}-retry`}
        onPress={onRetry}
        style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  caption: { fontSize: 14, color: colors.muted },
  message: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
    textAlign: 'center',
  },
  retry: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 15, fontWeight: '700', color: colors.primary },
  pressed: { opacity: 0.8 },
});
