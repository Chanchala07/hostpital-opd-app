import React from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { LogOut } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { colors } from '../theme/colors';

/** Asks first, so a stray tap doesn't log someone out mid-shift. */
export default function SignOutButton() {
  const { signOut } = useAuth();
  const confirm = () =>
    Alert.alert(
      'Sign out?',
      "You'll need your mobile number and password to sign in again.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: signOut },
      ],
    );
  return (
    <Pressable
      testID="sign-out"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      onPress={confirm}
      accessibilityRole="button"
    >
      <LogOut size={18} color={colors.error} />
      <Text style={styles.text}>Sign out</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pressed: { opacity: 0.8 },
  text: { fontSize: 15, fontWeight: '600', color: colors.error },
});
