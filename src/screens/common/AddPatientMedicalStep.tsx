import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import Avatar from '../../components/Avatar';
import type { MyDoctor } from '../../api/myDoctors';
import {
  Card,
  Field,
  FORM_RADIUS,
  Input,
  OptionButton,
  chunk,
  formStyles,
  type LayoutHandler,
} from '../../components/FormControls';
import { colors } from '../../theme/colors';
import { shortDoctorName } from '../assistant/deskModel';
import {
  COMMON_ALLERGIES,
  CONDITIONS,
  GENDERS,
  NO_ALLERGY,
  NO_CONDITION,
  REASON_MAX_LENGTH,
  ageLabel,
  maskMobile,
  toggleExclusive,
  type AddPatientForm,
  type FormErrors,
  type SetField,
} from './addPatientForm';

type Props = {
  form: AddPatientForm;
  errors: FormErrors;
  set: SetField;
  setForm: React.Dispatch<React.SetStateAction<AddPatientForm>>;
  today: Date;
  onEditPersonal: () => void;
  /** Lets the screen scroll to the reason card when it has an error. */
  trackSection: (key: 'reason') => { onLayout: LayoutHandler };
  /** Whose queue the patient can join; a picker shows when there are several. */
  doctors: MyDoctor[];
  doctorId: number | null;
  onDoctorChange: (id: number) => void;
};

/**
 * Step 2 of "Add new patient": doctor (desk only), reason for visit,
 * allergies and conditions.
 */
export default function AddPatientMedicalStep({
  form,
  errors,
  set,
  setForm,
  today,
  onEditPersonal,
  trackSection,
  doctors,
  doctorId,
  onDoctorChange,
}: Props) {
  const [allergyDraft, setAllergyDraft] = useState<string | null>(null);

  const summary = [
    ageLabel(form.dob, today),
    GENDERS.find(g => g.value === form.gender)?.label,
    maskMobile(form.mobile),
  ]
    .filter(Boolean)
    .join(' · ');
  const allergyChips = [
    ...COMMON_ALLERGIES,
    ...form.allergies.filter(a => !COMMON_ALLERGIES.includes(a)),
  ];

  const toggleAllergy = (item: string) =>
    setForm(f => ({
      ...f,
      allergies: toggleExclusive(f.allergies, item, NO_ALLERGY),
    }));

  const addAllergy = () => {
    const typed = (allergyDraft ?? '').trim().replace(/\s+/g, ' ');
    if (typed) {
      const item =
        allergyChips.find(a => a.toLowerCase() === typed.toLowerCase()) ??
        typed;
      if (!form.allergies.includes(item)) {
        toggleAllergy(item);
      }
    }
    setAllergyDraft(null);
  };

  return (
    <>
      {/* Who is being added */}
      <View style={[formStyles.card, styles.summaryCard]}>
        <Avatar
          name={form.fullName || '?'}
          size={42}
          background={colors.primarySoft}
          color={colors.primary}
        />
        <View style={formStyles.flex}>
          <Text style={styles.summaryName} numberOfLines={1}>
            {form.fullName.trim()}
          </Text>
          <Text testID="summary" style={formStyles.hint} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Pressable
          testID="edit-personal"
          onPress={onEditPersonal}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Edit personal details"
        >
          <Text style={formStyles.link}>Edit</Text>
        </Pressable>
      </View>

      {/* Desk staff working for several doctors pick whose queue. */}
      {doctors.length > 1 ? (
        <Card title="Doctor" subtitle="Joins this doctor's queue today">
          <View style={formStyles.optionGrid}>
            {chunk(doctors, 2).map(row => (
              <View
                key={row.map(d => d.id).join()}
                style={formStyles.optionRow}
              >
                {row.map(d => (
                  <OptionButton
                    key={d.id}
                    testID={`doctor-${d.id}`}
                    label={shortDoctorName(d.name)}
                    selected={doctorId === d.id}
                    onPress={() => onDoctorChange(d.id)}
                  />
                ))}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card {...trackSection('reason')}>
        <Field
          label="Reason for visit"
          required
          error={errors.reason}
          id="reason"
          labelStyle={formStyles.cardTitle}
        >
          <Input
            testID="reason"
            value={form.reason}
            onChangeText={t => set('reason', t)}
            placeholder="e.g. Fever and headache since 2 days"
            multiline
            maxLength={REASON_MAX_LENGTH}
            invalid={!!errors.reason}
          />
        </Field>
      </Card>

      <Card
        title="Allergies"
        subtitle="Doctors see this in red before prescribing"
      >
        <View style={styles.chipWrap}>
          {allergyChips.map(item => {
            const selected = form.allergies.includes(item);
            const none = item === NO_ALLERGY;
            return (
              <Pressable
                key={item}
                testID={`allergy-${item}`}
                onPress={() => toggleAllergy(item)}
                style={[
                  styles.chip,
                  selected && (none ? styles.chipNone : styles.chipAllergy),
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected &&
                      (none ? styles.chipNoneText : styles.chipAllergyText),
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {allergyDraft == null ? (
          <Pressable
            testID="other-allergy"
            onPress={() => setAllergyDraft('')}
            style={styles.dashed}
            accessibilityRole="button"
          >
            <Text style={styles.dashedText}>+ Other allergy</Text>
          </Pressable>
        ) : (
          <View style={formStyles.row}>
            <Input
              testID="other-allergy-input"
              value={allergyDraft}
              onChangeText={setAllergyDraft}
              placeholder="e.g. Ibuprofen"
              autoFocus
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={addAllergy}
              style={formStyles.flex}
            />
            <Pressable
              testID="add-allergy"
              onPress={addAllergy}
              style={({ pressed }) => [
                styles.smallButton,
                pressed && formStyles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.smallButtonText}>
                {allergyDraft.trim() ? 'Add' : 'Cancel'}
              </Text>
            </Pressable>
          </View>
        )}
      </Card>

      <Card title="Existing conditions">
        <View style={formStyles.optionGrid}>
          {chunk(CONDITIONS, 2).map(row => (
            <View key={row.join()} style={formStyles.optionRow}>
              {row.map(condition => {
                const selected = form.conditions.includes(condition);
                return (
                  <Pressable
                    key={condition}
                    testID={`condition-${condition}`}
                    onPress={() =>
                      setForm(f => ({
                        ...f,
                        conditions: toggleExclusive(
                          f.conditions,
                          condition,
                          NO_CONDITION,
                        ),
                      }))
                    }
                    style={[styles.checkTile, selected && styles.checkTileOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <View
                      style={[styles.checkbox, selected && styles.checkboxOn]}
                    >
                      {selected ? (
                        <Check size={14} color={colors.white} strokeWidth={3} />
                      ) : null}
                    </View>
                    <Text
                      style={[styles.checkText, selected && styles.checkTextOn]}
                      numberOfLines={1}
                    >
                      {condition}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryName: { fontSize: 15, fontWeight: '700', color: colors.text },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  chipAllergy: {
    backgroundColor: colors.alertSoft,
    borderColor: colors.alertLabel,
  },
  chipNone: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  chipText: { fontSize: 14, color: colors.text },
  chipAllergyText: { color: colors.alertLabel, fontWeight: '600' },
  chipNoneText: { color: colors.primary, fontWeight: '600' },
  dashed: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  dashedText: { fontSize: 14, color: colors.placeholder },
  smallButton: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: FORM_RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallButtonText: { fontSize: 14, fontWeight: '600', color: colors.text },
  checkTile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  checkTileOn: {
    backgroundColor: colors.selectedSoft,
    borderColor: colors.primary,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.placeholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkText: { flexShrink: 1, fontSize: 14, color: colors.text },
  checkTextOn: { color: colors.navy, fontWeight: '600' },
});
