import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Minus, Plus, TriangleAlert, X } from 'lucide-react-native';
import type { MedicineInput } from '../../api/visits';
import { Field, Input } from '../../components/FormControls';
import { colors } from '../../theme/colors';
import {
  DOSE_SLOTS,
  DOSE_STEP,
  DURATIONS,
  FORMS,
  FREQUENCY_PRESETS,
  MAX_DOSE,
  TIMINGS,
  doseLabel,
  emptyMedicineForm,
  formatFrequency,
  fromInput,
  sameDoses,
  toInput,
  validateMedicine,
  type Doses,
  type MedicineErrors,
  type MedicineForm,
} from './prescriptionForm';

/**
 * Add or edit one medicine: name, strength, form, morning / afternoon /
 * night doses, days, when to take it and a note.
 */
export default function MedicineSheet({
  visible,
  initial,
  allergies,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  /** The medicine being edited; null to add a new one. */
  initial: MedicineInput | null;
  /** Shown as a reminder while prescribing. */
  allergies: string[];
  onClose: () => void;
  onSubmit: (medicine: MedicineInput) => void;
}) {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<MedicineForm>(emptyMedicineForm);
  const [errors, setErrors] = useState<MedicineErrors>({});

  useEffect(() => {
    if (visible) {
      setForm(initial ? fromInput(initial) : emptyMedicineForm());
      setErrors({});
    }
  }, [visible, initial]);

  const set = <K extends keyof MedicineForm>(
    key: K,
    value: MedicineForm[K],
  ) => {
    setForm(f => ({ ...f, [key]: value }));
    if (key === 'doses' || key === 'medicineName' || key === 'durationDays') {
      setErrors(e => ({ ...e, [key]: undefined }));
    }
  };

  const setDose = (slot: number, dose: number) => {
    const doses = [...form.doses] as Doses;
    doses[slot] = dose;
    set('doses', doses);
  };

  const submit = () => {
    const found = validateMedicine(form);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    onSubmit(toInput(form));
  };

  const editing = initial !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={styles.flex} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>
              {editing ? 'Edit medicine' : 'Add medicine'}
            </Text>
            <Pressable
              testID="medicine-close"
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={22} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {allergies.length > 0 ? (
              <View style={styles.allergy}>
                <TriangleAlert size={16} color={colors.alertLabel} />
                <Text style={styles.allergyText}>
                  {`Allergic to ${allergies.join(', ')}`}
                </Text>
              </View>
            ) : null}

            <Field
              label="Medicine name"
              required
              error={errors.medicineName}
              id="medicineName"
            >
              <Input
                testID="medicine-name"
                value={form.medicineName}
                onChangeText={t => set('medicineName', t)}
                placeholder="e.g. Paracetamol"
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={150}
                invalid={!!errors.medicineName}
              />
            </Field>

            <Field label="Strength" optional>
              <Input
                testID="medicine-strength"
                value={form.strength}
                onChangeText={t => set('strength', t)}
                placeholder="e.g. 650 mg"
                autoCorrect={false}
                maxLength={40}
              />
            </Field>

            <Field label="Form" optional>
              <View style={styles.chips}>
                {FORMS.map(f => (
                  <Chip
                    key={f}
                    testID={`form-${f}`}
                    label={f}
                    selected={form.form === f}
                    onPress={() => set('form', form.form === f ? null : f)}
                  />
                ))}
              </View>
            </Field>

            <Field
              label="Dose · morning – afternoon – night"
              required
              error={errors.doses}
              id="doses"
            >
              <View style={styles.chips}>
                {FREQUENCY_PRESETS.map(p => {
                  const value = formatFrequency(p.doses);
                  return (
                    <Chip
                      key={value}
                      testID={`freq-${value}`}
                      label={`${value} · ${p.hint}`}
                      selected={sameDoses(form.doses, p.doses)}
                      onPress={() => set('doses', p.doses)}
                    />
                  );
                })}
              </View>
              <View style={styles.doseRow}>
                {DOSE_SLOTS.map((slot, i) => (
                  <DoseStepper
                    key={slot}
                    id={slot.toLowerCase()}
                    label={slot}
                    value={form.doses[i]}
                    onChange={dose => setDose(i, dose)}
                  />
                ))}
              </View>
            </Field>

            <Field
              label="For how many days"
              required
              error={errors.durationDays}
              id="durationDays"
            >
              <View style={styles.chips}>
                {DURATIONS.map(d => (
                  <Chip
                    key={d}
                    testID={`days-${d}`}
                    label={`${d} days`}
                    selected={form.durationDays.trim() === String(d)}
                    onPress={() => set('durationDays', String(d))}
                  />
                ))}
              </View>
              <Input
                testID="medicine-days"
                value={form.durationDays}
                onChangeText={t =>
                  set('durationDays', t.replace(/[^0-9]/g, ''))
                }
                placeholder="Or type the days"
                keyboardType="number-pad"
                maxLength={3}
                invalid={!!errors.durationDays}
              />
            </Field>

            <Field label="When to take" optional>
              <View style={styles.chips}>
                {TIMINGS.map(t => (
                  <Chip
                    key={t}
                    testID={`timing-${t}`}
                    label={t}
                    selected={form.timing === t}
                    onPress={() => set('timing', form.timing === t ? null : t)}
                  />
                ))}
              </View>
            </Field>

            <Field label="Instructions" optional>
              <Input
                testID="medicine-instructions"
                value={form.instructions}
                onChangeText={t => set('instructions', t)}
                placeholder="e.g. Dilute in warm water"
                maxLength={255}
              />
            </Field>
          </ScrollView>

          <View style={styles.buttons}>
            <Pressable
              testID="medicine-cancel"
              onPress={onClose}
              style={({ pressed }) => [
                styles.button,
                styles.outline,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.outlineText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="medicine-save"
              onPress={submit}
              style={({ pressed }) => [
                styles.button,
                styles.solid,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.solidText}>
                {editing ? 'Save changes' : 'Add medicine'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chip({
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
      style={[styles.chip, selected && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DoseStepper({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (dose: number) => void;
}) {
  const on = value > 0;
  return (
    <View style={[styles.doseBox, on && styles.doseBoxOn]}>
      <Text style={[styles.doseLabel, on && styles.doseLabelOn]}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          testID={`dose-${id}-minus`}
          onPress={() => onChange(Math.max(0, value - DOSE_STEP))}
          disabled={value <= 0}
          hitSlop={6}
          style={[styles.stepButton, value <= 0 && styles.stepDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Less ${label.toLowerCase()}`}
        >
          <Minus size={14} color={colors.navy} strokeWidth={2.5} />
        </Pressable>
        <Text testID={`dose-${id}`} style={styles.doseValue}>
          {doseLabel(value)}
        </Text>
        <Pressable
          testID={`dose-${id}-plus`}
          onPress={() => onChange(Math.min(MAX_DOSE, value + DOSE_STEP))}
          disabled={value >= MAX_DOSE}
          hitSlop={6}
          style={[styles.stepButton, value >= MAX_DOSE && styles.stepDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`More ${label.toLowerCase()}`}
        >
          <Plus size={14} color={colors.navy} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.navy },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 16, paddingBottom: 12, gap: 16 },
  allergy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.alertSoft,
    borderColor: colors.alertBorder,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  allergyText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.alertText,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.text },
  chipTextOn: { color: colors.primary, fontWeight: '700' },
  doseRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  doseBox: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doseBoxOn: {
    borderColor: colors.primary,
    backgroundColor: colors.selectedSoft,
  },
  doseLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  doseLabelOn: { color: colors.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.neutralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDisabled: { opacity: 0.35 },
  doseValue: {
    minWidth: 26,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: colors.navy,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: { borderWidth: 1.5, borderColor: colors.border },
  outlineText: { fontSize: 15, fontWeight: '600', color: colors.text },
  solid: { backgroundColor: colors.primary },
  solidText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
