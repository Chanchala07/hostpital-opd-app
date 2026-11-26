import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';

/** "98765 43210", "+91 98765-43210" → "9876543210"; null if not a mobile number. */
const toMobile = (value: string) => {
  const digits = value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

type Props = {
  /** Resolves when signed in; throw an Error to show its message. */
  onSignIn: (mobile: string, password: string) => Promise<void> | void;
  onForgotPassword: () => void;
  onSignInWithOtp: () => void;
  /** "New patient? Create account" */
  onCreateAccount: () => void;
};

export default function LoginScreen({
  onSignIn,
  onForgotPassword,
  onSignInWithOtp,
  onCreateAccount,
}: Props) {
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInputInstance>(null);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSignIn = async () => {
    if (submitting) {
      return;
    }
    const mobile = toMobile(phone);
    if (!mobile) {
      setError('Enter your 10-digit mobile number.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSignIn(mobile, password);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Sign in failed. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 16 },
        ]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
          <View style={styles.brandRow}>
            <View style={styles.logo}>
              <View style={styles.plusH} />
              <View style={styles.plusV} />
            </View>
            <Text style={styles.brandName}>Doctors Bookings</Text>
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to book visits and track your token.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Mobile number</Text>
          </View>
          <View style={styles.inputBox}>
            <Text style={styles.prefixText}>+91</Text>
            <TextInput
              testID="mobile-input"
              style={styles.boxInput}
              value={phone}
              onChangeText={text => {
                setPhone(text);
                setError(null);
              }}
              placeholder="98765 43210"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
              autoCorrect={false}
              autoComplete="tel"
              textContentType="telephoneNumber"
              maxLength={16}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>

          <View style={[styles.labelRow, styles.sectionGap]}>
            <Text style={styles.label}>Password</Text>
            <Pressable
              onPress={onForgotPassword}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={[styles.link, styles.smallLink]}>Forgot?</Text>
            </Pressable>
          </View>
          <View style={styles.passwordBox}>
            <TextInput
              testID="password-input"
              ref={passwordRef}
              style={styles.passwordInput}
              value={password}
              onChangeText={text => {
                setPassword(text);
                setError(null);
              }}
              placeholder="Enter your password"
              placeholderTextColor={colors.placeholder}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
            />
            <Pressable
              onPress={() => setShowPassword(v => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={
                showPassword ? 'Hide password' : 'Show password'
              }
            >
              <EyeIcon crossed={showPassword} />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.spacer} />

        <View style={styles.actions}>
          <Pressable
            testID="sign-in-button"
            style={({ pressed }) => [
              styles.primaryButton,
              (pressed || submitting) && styles.pressed,
            ]}
            onPress={handleSignIn}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityState={{ busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryButtonText}>Sign in</Text>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.pressed,
            ]}
            onPress={onSignInWithOtp}
            accessibilityRole="button"
          >
            <PhoneIcon />
            <Text style={styles.secondaryButtonText}>
              Sign in with OTP instead
            </Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New patient? </Text>
            <Pressable
              testID="create-account-link"
              onPress={onCreateAccount}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.link}>Create account</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <View style={styles.eye}>
      <View style={styles.eyePupil} />
      {crossed ? <View style={styles.eyeSlash} /> : null}
    </View>
  );
}

function PhoneIcon() {
  return (
    <View style={styles.phone}>
      <View style={styles.phoneButton} />
    </View>
  );
}

const FIELD_HEIGHT = 52;
const RADIUS = 12;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1 },

  header: {
    backgroundColor: colors.headerBg,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  logo: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  plusH: {
    width: 12,
    height: 2.5,
    borderRadius: 1,
    backgroundColor: colors.white,
  },
  plusV: {
    position: 'absolute',
    width: 2.5,
    height: 12,
    borderRadius: 1,
    backgroundColor: colors.white,
  },
  brandName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.navy,
    letterSpacing: 0.3,
  },
  title: { fontSize: 28, fontWeight: '800', color: colors.navy },
  subtitle: { marginTop: 6, fontSize: 14, color: colors.muted },

  form: { paddingHorizontal: 24, paddingTop: 28 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionGap: { marginTop: 20 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FIELD_HEIGHT,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: RADIUS,
    paddingHorizontal: 14,
  },
  prefixText: {
    marginRight: 10,
    paddingRight: 10,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    fontSize: 15,
    color: colors.muted,
  },
  boxInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 15,
    color: colors.text,
  },
  passwordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    height: FIELD_HEIGHT,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: RADIUS,
    paddingHorizontal: 14,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 15,
    color: colors.text,
  },
  error: { marginTop: 12, fontSize: 13, color: colors.error },

  spacer: { flex: 1, minHeight: 32 },

  actions: { paddingHorizontal: 24 },
  primaryButton: {
    height: FIELD_HEIGHT,
    borderRadius: RADIUS,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  secondaryButton: {
    marginTop: 12,
    height: FIELD_HEIGHT,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  pressed: { opacity: 0.85 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  footerText: { fontSize: 14, color: colors.muted },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  smallLink: { fontSize: 13 },

  eye: {
    width: 20,
    height: 13,
    borderWidth: 1.6,
    borderColor: colors.muted,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyePupil: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.muted,
  },
  eyeSlash: {
    position: 'absolute',
    width: 22,
    height: 1.6,
    backgroundColor: colors.muted,
    transform: [{ rotate: '-35deg' }],
  },
  phone: {
    width: 11,
    height: 16,
    borderWidth: 1.6,
    borderColor: colors.text,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 1.5,
  },
  phoneButton: {
    width: 3,
    height: 1.6,
    borderRadius: 1,
    backgroundColor: colors.text,
  },
});
