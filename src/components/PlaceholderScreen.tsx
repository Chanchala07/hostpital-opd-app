import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

type Props = {
  title: string;
  message?: string;
  children?: React.ReactNode;
};

/** Temporary screen for sections whose design isn't built yet. */
export default function PlaceholderScreen({
  title,
  message = 'This screen is coming soon.',
  children,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: colors.navy },
  message: { fontSize: 15, color: colors.muted, marginBottom: 16 },
});
