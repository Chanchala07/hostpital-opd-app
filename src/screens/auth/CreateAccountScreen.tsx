import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, Eye, EyeOff } from 'lucide-react-native';
import type { PatientSignUp } from '../../api/auth';
import { ApiError } from '../../api/client';
import {
  Field,
  Input,
  OptionButton,
  formStyles,
} from '../../components/FormControls';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import { GENDERS, formatDobInput } from '../common/addPatientForm';
import {
  CONFLICT_FIELDS,
  EMPTY_ACCOUNT,
  FIELD_ORDER,
  PASSWORD_MAX,
  mobileInput,
  passwordStrength,
  toSignUp,
  validateCreateAccount,
  type CreateAccountErrors,
  type CreateAccountForm,
} from './createAccountForm';

type Props = {
  /** Creates the account and signs in; throw an Error to show its message. */
  onSubmit: (account: PatientSignUp) => Promise<void> | void;
  onBack: () => void;
  /** "Already have an account? Sign in" */
  onSignIn: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
};

/** Bar colour per strength score (1 weak … 4 strong). */
const STRENGTH_COLORS = [
  colors.border,
  colors.error,
  colors.warning,
  colors.primary,
  colors.success,
];

/** New patient: everything on one screen, then signed in straight away. */
export default function CreateAccountScreen({
  onSubmit,
  onBack,
  onSignIn,
  onOpenTerms,
  onOpenPrivacy,
}: Props) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<CreateAccountForm>(EMPTY_ACCOUNT);
  const [errors, setErrors] = useState<CreateAccountErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const scrollRef = useRef<ScrollViewInstance>(null);
  /** Where each field sits in the scroll view (with its hint / meter). */
  const fieldBox = useRef<
    Partial<Record<keyof CreateAccountForm, { y: number; height: number }>>
  >({});
  /** How far the form is scrolled, and how much of it fits on screen. */
  const scrollY = useRef(0);
  const viewport = useRef(0);
  /** The field being typed in: kept in view above the keyboard. */
  const focused = useRef<keyof CreateAccountForm | null>(null);
  const mobileRef = useRef<TextInputInstance>(null);
  const dobRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const set = <K extends keyof CreateAccountForm>(
    key: K,
    value: CreateAccountForm[K],
  ) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => (e[key] ? { ...e, [key]: undefined } : e));
    setFormError(null);
  };

  /** Scrolls just enough to show the whole field, if it isn't already. */
  const reveal = (key: keyof CreateAccountForm) => {
    const box = fieldBox.current[key];
    if (!box || viewport.current <= 0) {
      return;
    }
    const top = box.y - 16;
    const bottom = box.y + box.height + 16;
    if (bottom > scrollY.current + viewport.current) {
      // Taller than the space left above the keyboard: show its top.
      const y = Math.min(top, bottom - viewport.current);
      scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: true });
    } else if (top < scrollY.current) {
      scrollRef.current?.scrollTo({ y: Math.max(0, top), animated: true });
    }
  };

  /** Wrapper of one field: remembers where it is. */
  const at = (key: keyof CreateAccountForm) => ({
    testID: `field-${key}`,
    onLayout: (e: {
      nativeEvent: { layout: { y: number; height: number } };
    }) => {
      const { y, height } = e.nativeEvent.layout;
      fieldBox.current[key] = { y, height };
      if (focused.current === key) {
        reveal(key); // e.g. the strength meter appeared under the password
      }
    },
  });

  /** Typing in a field keeps it visible. */
  const typingIn = (key: keyof CreateAccountForm) => ({
    onFocus: () => {
      focused.current = key;
      reveal(key);
    },
    onBlur: () => {
      if (focused.current === key) {
        focused.current = null;
      }
    },
  });

  const showFirst = (found: CreateAccountErrors) => {
    const first = FIELD_ORDER.find(k => found[k]);
    const y = first ? fieldBox.current[first]?.y : undefined;
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    }
  };

  const submit = async () => {
    if (submitting) {
      return;
    }
    const found = validateCreateAccount(form, new Date());
    setErrors(found);
    setFormError(null);
    if (Object.values(found).some(Boolean)) {
      showFirst(found);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(toSignUp(form));
    } catch (e) {
      const conflict =
        e instanceof ApiError ? CONFLICT_FIELDS[e.code] : undefined;
      if (conflict) {
        const next = { [conflict.field]: conflict.message };
        setErrors(next);
        showFirst(next);
      } else {
        setFormError(
          userMessage(e, "Couldn't create your account. Please try again."),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const strength = passwordStrength(form.password);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      // Edge-to-edge Android no longer resizes the window for the keyboard,
      // so pad on both platforms: the form shrinks to the space above it.
      behavior="padding"
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={e => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        onLayout={e => {
          // Shrinks when the keyboard opens: bring the field back into view.
          viewport.current = e.nativeEvent.layout.height;
          if (focused.current) {
            reveal(focused.current);
          }
        }}
      >
        <Pressable
          testID="back"
          onPress={onBack}
          hitSlop={12}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>

        <Text style={styles.title} accessibilityRole="header">
          Create your account
        </Text>
        <Text style={styles.subtitle}>
          Already registered at the hospital? Use the same mobile number.
        </Text>

        <View {...at('fullName')}>
          <Field label="Full name" error={errors.fullName} id="fullName">
            <Input
              testID="name-input"
              {...typingIn('fullName')}
              value={form.fullName}
              onChangeText={t => set('fullName', t)}
              placeholder="As on your ID"
              invalid={!!errors.fullName}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              maxLength={120}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => mobileRef.current?.focus()}
            />
          </Field>
        </View>

        <View {...at('mobile')} style={styles.gap}>
          <Field label="Mobile number" error={errors.mobile} id="mobile">
            <View style={styles.mobileRow}>
              <View style={[formStyles.input, styles.prefix]}>
                <Text style={styles.prefixText}>+91</Text>
              </View>
              <Input
                testID="mobile-input"
                {...typingIn('mobile')}
                ref={mobileRef}
                style={formStyles.flex}
                value={form.mobile}
                onChangeText={t => set('mobile', mobileInput(t))}
                placeholder="98XXXXXXXX"
                invalid={!!errors.mobile}
                keyboardType="number-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                maxLength={16}
                returnKeyType="next"
                submitBehavior="submit"
                onSubmitEditing={() => dobRef.current?.focus()}
              />
            </View>
            <Text style={styles.hint}>
              You'll sign in with this number. Token updates come here too.
            </Text>
          </Field>
        </View>

        <View {...at('dob')} style={styles.gap}>
          <Field label="Date of birth" error={errors.dob} id="dob">
            <Input
              testID="dob-input"
              {...typingIn('dob')}
              ref={dobRef}
              value={form.dob}
              onChangeText={t => set('dob', formatDobInput(t))}
              placeholder="DD / MM / YYYY"
              invalid={!!errors.dob}
              keyboardType="number-pad"
              autoComplete="birthdate-full"
              maxLength={10}
            />
          </Field>
        </View>

        <View {...at('gender')} style={styles.gap}>
          <Field label="Gender" error={errors.gender} id="gender">
            <View style={formStyles.optionRow} accessibilityRole="radiogroup">
              {GENDERS.map(g => (
                <OptionButton
                  key={g.value}
                  testID={`gender-${g.value}`}
                  label={g.label}
                  selected={form.gender === g.value}
                  onPress={() => set('gender', g.value)}
                />
              ))}
            </View>
          </Field>
        </View>

        <View {...at('email')} style={styles.gap}>
          <Field label="Email" optional error={errors.email} id="email">
            <Input
              testID="email-input"
              {...typingIn('email')}
              ref={emailRef}
              value={form.email}
              onChangeText={t => set('email', t)}
              placeholder="name@email.com"
              invalid={!!errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              maxLength={190}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </Field>
        </View>

        <View {...at('password')} style={styles.gap}>
          <Field label="Create password" error={errors.password} id="password">
            <View
              style={[
                formStyles.input,
                styles.passwordBox,
                !!errors.password && styles.invalid,
              ]}
            >
              <TextInput
                testID="password-input"
                {...typingIn('password')}
                ref={passwordRef}
                style={styles.passwordInput}
                value={form.password}
                onChangeText={t => set('password', t)}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.placeholder}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                maxLength={PASSWORD_MAX}
                returnKeyType="done"
              />
              <Pressable
                testID="toggle-password"
                onPress={() => setShowPassword(v => !v)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? 'Hide password' : 'Show password'
                }
              >
                {showPassword ? (
                  <EyeOff size={20} color={colors.muted} />
                ) : (
                  <Eye size={20} color={colors.muted} />
                )}
              </Pressable>
            </View>
            {strength.score > 0 ? (
              <View>
                <View style={styles.meter}>
                  {[1, 2, 3, 4].map(bar => (
                    <View
                      key={bar}
                      style={[
                        styles.meterBar,
                        bar <= strength.score && {
                          backgroundColor: STRENGTH_COLORS[strength.score],
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text testID="password-strength" style={styles.hint}>
                  {strength.label}
                </Text>
              </View>
            ) : null}
          </Field>
        </View>

        <View {...at('agreed')} style={styles.gap}>
          <Pressable
            testID="agree"
            onPress={() => set('agreed', !form.agreed)}
            style={styles.agreeRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: form.agreed }}
          >
            <View
              style={[
                styles.checkbox,
                form.agreed && styles.checkboxOn,
                !!errors.agreed && styles.invalid,
              ]}
            >
              {form.agreed ? (
                <Check size={14} color={colors.white} strokeWidth={3} />
              ) : null}
            </View>
            <Text style={styles.agreeText}>
              I agree to the{' '}
              <Text
                testID="terms-link"
                style={styles.inlineLink}
                onPress={onOpenTerms}
                accessibilityRole="link"
              >
                Terms
              </Text>{' '}
              and{' '}
              <Text
                testID="privacy-link"
                style={styles.inlineLink}
                onPress={onOpenPrivacy}
                accessibilityRole="link"
              >
                Privacy Policy
              </Text>
              , and consent to my health records being stored securely.
            </Text>
          </Pressable>
          {errors.agreed ? (
            <Text testID="error-agreed" style={styles.error}>
              {errors.agreed}
            </Text>
          ) : null}
        </View>

        {formError ? (
          <Text testID="form-error" style={[styles.error, styles.formError]}>
            {formError}
          </Text>
        ) : null}

        <Pressable
          testID="create-account"
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || submitting) && formStyles.pressed,
          ]}
          onPress={submit}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityState={{ busy: submitting }}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.primaryButtonText}>Create account</Text>
          )}
        </Pressable>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Pressable
            testID="go-sign-in"
            onPress={onSignIn}
            hitSlop={8}
            accessibilityRole="link"
          >
            <Text style={formStyles.link}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  title: { marginTop: 20, fontSize: 26, fontWeight: '800', color: colors.navy },
  subtitle: {
    marginTop: 6,
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  gap: { marginTop: 18 },
  hint: { marginTop: 2, fontSize: 12, color: colors.muted },
  mobileRow: { flexDirection: 'row', gap: 8 },
  prefix: {
    width: 56,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  prefixText: { fontSize: 15, color: colors.text },
  passwordBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 0,
  },
  passwordInput: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 0,
    fontSize: 15,
    color: colors.text,
  },
  invalid: { borderColor: colors.error },
  meter: { flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 4 },
  meterBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  agreeText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },
  inlineLink: { color: colors.primary, fontWeight: '600' },
  error: { marginTop: 6, fontSize: 12, color: colors.error },
  formError: { marginTop: 16, fontSize: 13 },
  primaryButton: {
    marginTop: 24,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  footerText: { fontSize: 14, color: colors.muted },
});
