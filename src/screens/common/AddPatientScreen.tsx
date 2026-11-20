import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Camera, Check, X } from 'lucide-react-native';
import {
  Card,
  Field,
  FORM_RADIUS,
  Input,
  OptionButton,
  formStyles,
  type LayoutHandler,
} from '../../components/FormControls';
import { getMyDoctors, type MyDoctor } from '../../api/myDoctors';
import { addPatient, type AddedPatient } from '../../api/patients';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import { comingSoon } from '../../utils/format';
import AddPatientMedicalStep from './AddPatientMedicalStep';
import {
  EMPTY_FORM,
  GENDERS,
  ageLabel,
  clearDraft,
  digitsOnly,
  formatDobInput,
  loadDraft,
  saveDraft,
  toNewPatient,
  validateMedical,
  validatePersonal,
  type AddPatientForm,
  type FormErrors,
  type SetField,
} from './addPatientForm';

type Props = {
  onClose: () => void;
  /** Registered and given today's token (POST /patients). */
  onSaved: (result: AddedPatient) => void;
};

type Step = 1 | 2;
type SectionKey = 'personal' | 'contact' | 'reason';

/** Which card each validated field lives in, for scrolling to errors. */
const SECTION_OF: Partial<Record<keyof AddPatientForm, SectionKey>> = {
  fullName: 'personal',
  dob: 'personal',
  gender: 'personal',
  mobile: 'contact',
  email: 'contact',
  reason: 'reason',
};

const sameForm = (a: AddPatientForm, b: AddPatientForm) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Two-step registration used by both doctors and assistants:
 * 1 · Personal details → 2 · Medical information → registered and checked
 * in to today's queue (a doctor's own; the desk picks the doctor).
 */
export default function AddPatientScreen({ onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [today] = useState(() => new Date());
  const [startForm, setStartForm] = useState(() => loadDraft() ?? EMPTY_FORM);
  const [form, setForm] = useState<AddPatientForm>(startForm);
  const [fromDraft, setFromDraft] = useState(() => loadDraft() != null);
  const [step, setStep] = useState<Step>(1);
  const [showErrors, setShowErrors] = useState({ 1: false, 2: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Whose queue the patient can join (loaded from my profile). */
  const [doctors, setDoctors] = useState<MyDoctor[] | null>(null);
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const sectionY = useRef<Partial<Record<SectionKey, number>>>({});
  const mounted = useRef(true);

  const loadDoctors = async () => {
    const list = (await getMyDoctors()).doctors;
    if (mounted.current) {
      setDoctors(list);
      setDoctorId(id => id ?? list[0]?.id ?? null);
    }
    return list;
  };

  useEffect(() => {
    mounted.current = true;
    // If this fails, saving tries again and shows the error then.
    loadDoctors().catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  const personalErrors = useMemo(
    () => validatePersonal(form, today),
    [form, today],
  );
  const medicalErrors = useMemo(() => validateMedical(form), [form]);
  // Errors show only after the user tries to continue on that step.
  const errors: FormErrors = !showErrors[step]
    ? {}
    : step === 1
    ? personalErrors
    : medicalErrors;

  const dirty = !sameForm(form, startForm);
  const empty = sameForm(form, EMPTY_FORM);
  const age = ageLabel(form.dob, today);

  const set: SetField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const trackSection = (key: SectionKey): { onLayout: LayoutHandler } => ({
    onLayout: e => {
      sectionY.current[key] = e.nativeEvent.layout.y;
    },
  });

  const goToStep = (next: Step) => {
    setStep(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const scrollToFirstError = (found: FormErrors) => {
    const field = Object.keys(found)[0] as keyof AddPatientForm | undefined;
    const section = field ? SECTION_OF[field] : undefined;
    const y = section ? sectionY.current[section] : undefined;
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  };

  const next = () => {
    setShowErrors(s => ({ ...s, 1: true }));
    if (Object.keys(personalErrors).length > 0) {
      scrollToFirstError(personalErrors);
      return;
    }
    goToStep(2);
  };

  const save = async () => {
    if (submitting) {
      return;
    }
    setShowErrors(s => ({ ...s, 2: true }));
    if (Object.keys(medicalErrors).length > 0) {
      scrollToFirstError(medicalErrors);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const list = doctors ?? (await loadDoctors());
      const queueDoctor = doctorId ?? list[0]?.id;
      if (queueDoctor == null) {
        setSubmitError(
          'No doctor is linked to your account, so the patient can’t join a queue.',
        );
        setSubmitting(false);
        return;
      }
      const { data } = await addPatient(toNewPatient(form, queueDoctor));
      clearDraft();
      onSaved(data);
    } catch (e) {
      // e.g. 409 "Rahul Kapoor is already registered as PT-20418"
      setSubmitError(userMessage(e, 'Could not save. Please try again.'));
      setSubmitting(false);
    }
  };

  const saveDraftAndClose = () => {
    saveDraft(form);
    onClose();
    Alert.alert(
      'Draft saved',
      `${
        form.fullName.trim() || 'This patient'
      } is saved as a draft. Tap + on Patients to finish adding them.`,
    );
  };

  const close = () => {
    if (!dirty) {
      onClose();
      return;
    }
    Alert.alert(
      'Discard this patient?',
      'What you entered will be lost unless you save a draft.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Save draft', onPress: saveDraftAndClose },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            clearDraft();
            onClose();
          },
        },
      ],
    );
  };

  const startOver = () => {
    clearDraft();
    setStartForm(EMPTY_FORM);
    setForm(EMPTY_FORM);
    setFromDraft(false);
    setShowErrors({ 1: false, 2: false });
  };

  // Android back: step 2 → step 1; step 1 → same as Cancel.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!submitting) {
        if (step === 2) {
          goToStep(1);
        } else {
          close();
        }
      }
      return true;
    });
    return () => sub.remove();
  });

  return (
    <View style={styles.screen}>
      {/* Header + step progress */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleRow}>
          <Pressable
            testID={step === 1 ? 'close' : 'back'}
            onPress={step === 1 ? close : () => goToStep(1)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={
              step === 1 ? 'Close' : 'Back to personal details'
            }
          >
            {step === 1 ? (
              <X size={22} color={colors.text} />
            ) : (
              <ArrowLeft size={22} color={colors.text} />
            )}
          </Pressable>
          <Text style={[styles.title, formStyles.flex]}>Add new patient</Text>
          <Pressable
            testID="save-draft"
            onPress={saveDraftAndClose}
            disabled={empty || submitting}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityState={{ disabled: empty || submitting }}
          >
            <Text style={[styles.saveDraft, empty && styles.saveDraftOff]}>
              Save draft
            </Text>
          </Pressable>
        </View>
        <View style={styles.steps}>
          <StepBar
            label={step === 1 ? '1 · Personal details' : '✓ Personal details'}
            state={step === 1 ? 'active' : 'done'}
          />
          <StepBar
            label="2 · Medical information"
            state={step === 2 ? 'active' : 'todo'}
          />
        </View>
      </View>

      <KeyboardAvoidingView
        style={formStyles.flex}
        // Edge-to-edge Android no longer resizes the window for the keyboard,
        // so pad on both platforms to keep the focused field visible.
        behavior="padding"
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {step === 2 ? (
            <AddPatientMedicalStep
              form={form}
              errors={errors}
              set={set}
              setForm={setForm}
              today={today}
              onEditPersonal={() => goToStep(1)}
              trackSection={trackSection}
              doctors={doctors ?? []}
              doctorId={doctorId}
              onDoctorChange={setDoctorId}
            />
          ) : (
            <>
              {fromDraft ? (
                <View style={styles.draftNote}>
                  <Text style={styles.draftNoteText}>
                    Continuing your saved draft
                  </Text>
                  <Pressable
                    testID="start-over"
                    onPress={startOver}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={formStyles.link}>Start over</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Personal */}
              <Card {...trackSection('personal')}>
                <Pressable
                  testID="photo"
                  onPress={() => comingSoon('Patient photo')}
                  style={styles.photoRow}
                  accessibilityRole="button"
                  accessibilityLabel="Add patient photo"
                >
                  <View style={styles.photoCircle}>
                    <Camera size={22} color={colors.primary} />
                  </View>
                  <View style={formStyles.flex}>
                    <Text style={styles.photoTitle}>Patient photo</Text>
                    <Text style={formStyles.hint}>
                      Optional · helps the desk identify them
                    </Text>
                  </View>
                </Pressable>

                <Field
                  label="Full name"
                  required
                  error={errors.fullName}
                  id="fullName"
                >
                  <Input
                    testID="full-name"
                    value={form.fullName}
                    onChangeText={t => set('fullName', t)}
                    placeholder="As on ID card"
                    autoCapitalize="words"
                    autoComplete="name"
                    maxLength={80}
                    invalid={!!errors.fullName}
                  />
                </Field>

                <View style={formStyles.row}>
                  <Field
                    label="Date of birth"
                    required
                    error={errors.dob}
                    id="dob"
                    style={formStyles.flex}
                  >
                    <Input
                      testID="dob"
                      value={form.dob}
                      onChangeText={t => set('dob', formatDobInput(t))}
                      placeholder="DD/MM/YYYY"
                      keyboardType="number-pad"
                      maxLength={10}
                      invalid={!!errors.dob}
                    />
                  </Field>
                  <Field label="Age" style={formStyles.flex}>
                    <View style={[formStyles.input, formStyles.inputReadOnly]}>
                      <Text
                        testID="age"
                        style={age ? styles.valueText : styles.placeholderText}
                      >
                        {age ?? 'Auto'}
                      </Text>
                    </View>
                  </Field>
                </View>

                <Field
                  label="Gender"
                  required
                  error={errors.gender}
                  id="gender"
                >
                  <View style={formStyles.optionRow}>
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
              </Card>

              {/* Contact */}
              <Card title="Contact" {...trackSection('contact')}>
                <Field
                  label="Mobile number"
                  required
                  error={errors.mobile}
                  id="mobile"
                >
                  <View style={formStyles.row}>
                    <View
                      style={[
                        formStyles.input,
                        formStyles.inputReadOnly,
                        styles.prefix,
                      ]}
                    >
                      <Text style={styles.valueText}>+91</Text>
                    </View>
                    <Input
                      testID="mobile"
                      value={form.mobile}
                      onChangeText={t => set('mobile', digitsOnly(t, 10))}
                      placeholder="98XXXXXXXX"
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      maxLength={10}
                      invalid={!!errors.mobile}
                      style={formStyles.flex}
                    />
                  </View>
                </Field>
                <Field label="Email" optional error={errors.email} id="email">
                  <Input
                    testID="email"
                    value={form.email}
                    onChangeText={t => set('email', t)}
                    placeholder="name@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    invalid={!!errors.email}
                  />
                </Field>
              </Card>
            </>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {submitError ? (
            <Text style={styles.submitError}>{submitError}</Text>
          ) : null}
          <View style={formStyles.row}>
            <Pressable
              testID={step === 1 ? 'cancel' : 'back-step'}
              onPress={step === 1 ? close : () => goToStep(1)}
              disabled={submitting}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && formStyles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>
                {step === 1 ? 'Cancel' : 'Back'}
              </Text>
            </Pressable>
            <Pressable
              testID={step === 1 ? 'next' : 'save-patient'}
              onPress={step === 1 ? next : save}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || submitting) && formStyles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : step === 1 ? (
                <>
                  <Text style={styles.primaryText}>Next: Medical info</Text>
                  <ArrowRight
                    size={18}
                    color={colors.white}
                    strokeWidth={2.5}
                  />
                </>
              ) : (
                <>
                  <Check size={18} color={colors.white} strokeWidth={2.5} />
                  <Text style={styles.primaryText}>Save patient</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function StepBar({
  label,
  state,
}: {
  label: string;
  state: 'todo' | 'active' | 'done';
}) {
  return (
    <View style={formStyles.flex}>
      <View
        style={[
          styles.stepBar,
          state === 'active' && styles.stepBarActive,
          state === 'done' && styles.stepBarDone,
        ]}
      />
      <Text
        style={[
          styles.stepLabel,
          state === 'active' && styles.stepLabelActive,
          state === 'done' && styles.stepLabelDone,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 16,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { fontSize: 21, fontWeight: '700', color: colors.navy },
  saveDraft: { fontSize: 15, fontWeight: '600', color: colors.primary },
  saveDraftOff: { color: colors.placeholder },
  steps: { flexDirection: 'row', gap: 8 },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: colors.border },
  stepBarActive: { backgroundColor: colors.primary },
  stepBarDone: { backgroundColor: colors.success },
  stepLabel: { marginTop: 6, fontSize: 12, color: colors.muted },
  stepLabelActive: { color: colors.primary, fontWeight: '600' },
  stepLabelDone: { color: colors.successText, fontWeight: '600' },

  content: { padding: 16, gap: 14, paddingBottom: 24 },
  draftNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.noteSoft,
    borderRadius: FORM_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  draftNoteText: { fontSize: 13, fontWeight: '500', color: colors.noteText },

  // Step 1
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryBorder,
    backgroundColor: colors.selectedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  valueText: { fontSize: 15, color: colors.text },
  placeholderText: { fontSize: 15, color: colors.placeholder },
  prefix: { paddingHorizontal: 12 },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  submitError: { fontSize: 13, color: colors.error },
  secondaryButton: {
    height: 54,
    paddingHorizontal: 20,
    borderRadius: FORM_RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: 16, fontWeight: '600', color: colors.text },
  primaryButton: {
    flex: 1,
    height: 54,
    borderRadius: FORM_RADIUS,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
