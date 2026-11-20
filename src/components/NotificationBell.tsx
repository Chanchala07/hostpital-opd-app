import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { colors } from '../theme/colors';

type Props = {
  hasUnread?: boolean;
  onPress: () => void;
};

export default function NotificationBell({
  hasUnread = false,
  onPress,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        hasUnread ? 'Notifications, unread items' : 'Notifications'
      }
    >
      <Bell size={20} color={colors.text} />
      {hasUnread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  dot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
