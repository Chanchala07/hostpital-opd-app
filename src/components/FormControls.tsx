// Small form building blocks shared by data-entry screens (Add patient, …).

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { colors } from '../theme/colors';

export type LayoutHandler = (e: {
  nativeEvent: { layout: { y: number } };
}) => void;

/** [a, b, c, d, e] → [[a, b], [c, d], [e]] */
export function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

/** White rounded section with an optional title row. */
export function Card({
  title,
  subtitle,
  right,
  children,
  onLayout,
  style,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  onLayout?: LayoutHandler;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[formStyles.card, style]} onLayout={onLayout}>
      {title ? (
        <View>
          <View style={styles.cardTitleRow}>
            <Text style={formStyles.cardTitle}>{title}</Text>
            {right}
          </View>
          {subtitle ? <Text style={formStyles.hint}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Label (with * or "(optional)"), the control, and an error line. */
export function Field({
  label,
  required,
  optional,
  error,
  id,
  style,
  labelStyle,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  /** Form key, used for the error's testID (`error-{id}`). */
  id?: string;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.label, labelStyle]}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
        {optional ? <Text style={styles.optional}> (optional)</Text> : null}
      </Text>
      {children}
      {error ? (
        <Text testID={id ? `error-${id}` : undefined} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Input({
  invalid,
  style,
  ref,
  ...rest
}: TextInputProps & {
  invalid?: boolean;
  /** To move the cursor here, e.g. from the previous field's "next" key. */
  ref?: React.Ref<TextInputInstance>;
}) {
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.placeholder}
      textAlignVertical={rest.multiline ? 'top' : 'center'}
      {...rest}
      style={[
        formStyles.input,
        rest.multiline && formStyles.multiline,
        invalid && styles.inputInvalid,
        style,
      ]}
    />
  );
}

/** One choice in a row of equal-width choices (gender, blood group…). */
export function OptionButton({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.optionText, selected && styles.optionTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Looks like an input; opens a picker (e.g. SelectSheet) when pressed. */
export function SelectField({
  value,
  placeholder,
  onPress,
  invalid,
  testID,
  accessibilityLabel,
}: {
  /** Text of the chosen option, or null when nothing is chosen. */
  value: string | null;
  placeholder: string;
  onPress: () => void;
  invalid?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[formStyles.input, styles.select, invalid && styles.inputInvalid]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text
        style={value ? styles.selectValue : styles.selectPlaceholder}
        numberOfLines={1}
      >
        {value ?? placeholder}
      </Text>
      <ChevronDown size={18} color={colors.muted} />
    </Pressable>
  );
}

export const FORM_RADIUS = 12;

/** Styles screens reuse next to these controls. */
export const formStyles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.navy },
  hint: { marginTop: 2, fontSize: 12, color: colors.muted },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  mutedLink: { fontSize: 14, fontWeight: '600', color: colors.muted },
  input: {
    minHeight: 48,
    borderRadius: FORM_RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  /** A box shaped like an input that shows a computed value. */
  inputReadOnly: {
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  multiline: { minHeight: 68 },
  optionGrid: { gap: 10 },
  optionRow: { flexDirection: 'row', gap: 10 },
});

const styles = StyleSheet.create({
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  required: { color: colors.error },
  optional: { fontWeight: '400', color: colors.muted },
  error: { fontSize: 12, color: colors.error },
  inputInvalid: { borderColor: colors.error },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  selectValue: { flexShrink: 1, fontSize: 15, color: colors.text },
  selectPlaceholder: { flexShrink: 1, fontSize: 15, color: colors.placeholder },
  option: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  optionText: { fontSize: 14, fontWeight: '500', color: colors.text },
  optionTextOn: { color: colors.primary, fontWeight: '700' },
});
