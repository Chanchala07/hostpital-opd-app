import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check } from 'lucide-react-native';
import { ApiError } from '../../api/client';
import {
  createStaff,
  getStaffFormOptions,
  type CreatedStaff,
  type StaffFormOptions,
} from '../../api/staff';
import {
  Card,
  Field,
  FORM_RADIUS,
  Input,
  SelectField,
  formStyles,
} from '../../components/FormControls';
import { SegmentedTabs } from '../../components/ListControls';
import SelectSheet, { type SelectOption } from '../../components/SelectSheet';
import { colors } from '../../theme/colors';
import { formatSlotTime } from '../../utils/format';
import {
  CONFLICT_FIELDS,
  SLOT_MINUTES,
  TIME_OPTIONS,
  WEEKDAYS,
  initialForm,
  toNewStaff,
  validateStaff,
  type AddStaffForm,
  type DaySchedule,
  type StaffErrors,
  type StaffRole,
} from './addStaffForm';

type Props = {
  onClose: () => void;
  onSaved: (result: CreatedStaff, role: StaffRole) => void;
};

type Picker =
  | { kind: 'department' }
  | { kind: 'desk' }
  | { kind: 'startTime' | 'endTime' | 'slotMinutes'; weekday: number };

type SectionKey = 'person' | 'professional' | 'clinic' | 'schedule';

/** Which card a field is in, for scrolling to the first error. */
function sectionOf(key: string): SectionKey {
  if (['fullName', 'phone', 'email'].includes(key)) {
    return 'person';
  }
  if (['specialization', 'qualification', 'registrationNo'].includes(key)) {
    return 'professional';
  }
  return key.startsWith('schedule') ? 'schedule' : 'clinic';
}

const timeOptions: SelectOption<string>[] = TIME_OPTIONS.map(t => ({
  value: t,
  label: formatSlotTime(t),
}));
const slotOptions: SelectOption<number>[] = SLOT_MINUTES.map(m => ({
  value: m,
  label: `${m} min`,
}));

/** Doctor-only: add a doctor or an assistant to the doctor's facility. */
export default function AddStaffScreen({ onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [options, setOptions] = useState<StaffFormOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<AddStaffForm | null>(null);
  const [startForm, setStartForm] = useState<AddStaffForm | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<StaffErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const sectionY = useRef<Partial<Record<SectionKey, number>>>({});

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const loaded = await getStaffFormOptions();
      const blank = initialForm(loaded);
      setOptions(loaded);
      setForm(blank);
      setStartForm(blank);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'Could not load the form. Try again.',
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    form != null && JSON.stringify(form) !== JSON.stringify(startForm);

  const close = () => {
    if (!dirty || submitting) {
      if (!submitting) {
        onClose();
      }
      return;
    }
    Alert.alert(
      'Discard this staff member?',
      'What you entered will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ],
    );
  };

  // Android back works like Cancel.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  });

  if (!form || !options) {
    return (
      <View style={styles.screen}>
        <Header
          title="Add staff member"
          onBack={onClose}
          topInset={insets.top}
        />
        <View style={styles.centered}>
          {loadError ? (
            <>
              <Text style={styles.loadError}>{loadError}</Text>
              <Pressable
                testID="retry"
                onPress={load}
                style={({ pressed }) => [
                  styles.retryButton,
                  pressed && formStyles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      </View>
    );
  }

  const isDoctor = form.role === 'doctor';
  const errors: StaffErrors = {
    ...(showErrors ? validateStaff(form) : {}),
    ...serverErrors,
  };

  const set = <K extends keyof AddStaffForm>(
    key: K,
    value: AddStaffForm[K],
  ) => {
    setForm(f => (f ? { ...f, [key]: value } : f));
    // Editing a field clears the server's complaint about it.
    setServerErrors(e =>
      key in e
        ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key))
        : e,
    );
  };
  const setDay = (weekday: number, patch: Partial<DaySchedule>) =>
    set(
      'schedule',
      form.schedule.map((day, i) =>
        i === weekday ? { ...day, ...patch } : day,
      ),
    );
  const copyMondayToAll = () => {
    const { startTime, endTime, slotMinutes } = form.schedule[1];
    set(
      'schedule',
      form.schedule.map(day =>
        day.open ? { ...day, startTime, endTime, slotMinutes } : day,
      ),
    );
  };
  const toggleDoctor = (id: number) =>
    set(
      'doctorIds',
      form.doctorIds.includes(id)
        ? form.doctorIds.filter(d => d !== id)
        : [...form.doctorIds, id],
    );

  const track = (key: SectionKey) => ({
    onLayout: (e: { nativeEvent: { layout: { y: number } } }) => {
      sectionY.current[key] = e.nativeEvent.layout.y;
    },
  });
  const scrollToError = (found: StaffErrors) => {
    const first = Object.keys(found)[0];
    const y = first ? sectionY.current[sectionOf(first)] : undefined;
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }
  };

  const submit = async () => {
    if (submitting) {
      return;
    }
    setShowErrors(true);
    const found = validateStaff(form);
    if (Object.keys(found).length > 0) {
      scrollToError(found);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const result = await createStaff(toNewStaff(form));
      onSaved(result, form.role);
    } catch (e) {
      const field = e instanceof ApiError ? CONFLICT_FIELDS[e.code] : undefined;
      if (field && e instanceof ApiError) {
        // e.g. email already used: show it on the field itself.
        setServerErrors({ [field]: e.message });
        scrollToError({ [field]: e.message });
      } else {
        setSubmitError(
          e instanceof Error ? e.message : 'Could not save. Please try again.',
        );
      }
      setSubmitting(false);
    }
  };

  // Picker sheet
  const departmentName = options.departments.find(
    d => d.id === form.departmentId,
  )?.name;
  const sheet = ((): {
    title: string;
    options: SelectOption<string | number>[];
    value: string | number | null;
    pick: (value: string | number) => void;
  } | null => {
    if (!picker) {
      return null;
    }
    switch (picker.kind) {
      case 'department':
        return {
          title: 'Department',
          options: options.departments.map(d => ({
            value: d.id,
            label: d.name,
          })),
          value: form.departmentId,
          pick: (v: string | number) => set('departmentId', Number(v)),
        };
      case 'desk':
        return {
          title: 'Desk',
          options: options.desks.map(d => ({ value: d, label: d })),
          value: form.desk,
          pick: (v: string | number) => set('desk', String(v)),
        };
      case 'slotMinutes':
        return {
          title: `${WEEKDAYS[picker.weekday]} · slot length`,
          options: slotOptions,
          value: form.schedule[picker.weekday].slotMinutes,
          pick: (v: string | number) =>
            setDay(picker.weekday, { slotMinutes: Number(v) }),
        };
      default:
        return {
          title: `${WEEKDAYS[picker.weekday]} · ${
            picker.kind === 'startTime' ? 'start time' : 'end time'
          }`,
          options: timeOptions,
          value: form.schedule[picker.weekday][picker.kind],
          pick: (v: string | number) =>
            setDay(picker.weekday, { [picker.kind]: String(v) }),
        };
    }
  })();

  return (
    <View style={styles.screen}>
      <Header
        title="Add staff member"
        subtitle={options.facility.name}
        onBack={close}
        topInset={insets.top}
      />

      <KeyboardAvoidingView style={formStyles.flex} behavior="padding">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <SegmentedTabs
            testIDPrefix="role"
            options={[
              { key: 'doctor', label: 'Doctor' },
              { key: 'assistant', label: 'Assistant' },
            ]}
            value={form.role}
            onChange={role => set('role', role)}
          />

          {/* Who */}
          <Card title="Personal details" {...track('person')}>
            <Field
              label="Full name"
              required
              error={errors.fullName}
              id="fullName"
            >
              <Input
                testID="staff-name"
                value={form.fullName}
                onChangeText={t => set('fullName', t)}
                placeholder={
                  isDoctor ? 'e.g. Dr. Meera Shah' : 'e.g. Neha Patil'
                }
                autoCapitalize="words"
                maxLength={120}
                invalid={!!errors.fullName}
              />
            </Field>
            <Field label="Phone" required error={errors.phone} id="phone">
              <View style={formStyles.row}>
                <View
                  style={[
                    formStyles.input,
                    formStyles.inputReadOnly,
                    styles.prefix,
                  ]}
                >
                  <Text style={styles.prefixText}>+91</Text>
                </View>
                <Input
                  testID="staff-phone"
                  value={form.phone}
                  onChangeText={t =>
                    set('phone', t.replace(/\D/g, '').slice(0, 10))
                  }
                  placeholder="98XXXXXXXX"
                  keyboardType="phone-pad"
                  maxLength={10}
                  invalid={!!errors.phone}
                  style={formStyles.flex}
                />
              </View>
            </Field>
            <Field label="Email" required error={errors.email} id="email">
              <Input
                testID="staff-email"
                value={form.email}
                onChangeText={t => set('email', t)}
                placeholder="name@hospital.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={190}
                invalid={!!errors.email}
              />
            </Field>
            <Text style={formStyles.hint}>
              They get a link by SMS and email to set a password and sign in.
            </Text>
          </Card>

          {isDoctor ? (
            <>
              <Card title="Professional details" {...track('professional')}>
                <Field
                  label="Specialisation"
                  required
                  error={errors.specialization}
                  id="specialization"
                >
                  <Input
                    testID="specialization"
                    value={form.specialization}
                    onChangeText={t => set('specialization', t)}
                    placeholder="e.g. General Medicine"
                    maxLength={100}
                    invalid={!!errors.specialization}
                  />
                </Field>
                <Field
                  label="Qualification"
                  required
                  error={errors.qualification}
                  id="qualification"
                >
                  <Input
                    testID="qualification"
                    value={form.qualification}
                    onChangeText={t => set('qualification', t)}
                    placeholder="e.g. MBBS, MD"
                    maxLength={120}
                    invalid={!!errors.qualification}
                  />
                </Field>
                <Field
                  label="Registration no."
                  required
                  error={errors.registrationNo}
                  id="registrationNo"
                >
                  <Input
                    testID="registration-no"
                    value={form.registrationNo}
                    onChangeText={t => set('registrationNo', t)}
                    placeholder="Medical council registration no."
                    autoCapitalize="characters"
                    maxLength={60}
                    invalid={!!errors.registrationNo}
                  />
                </Field>
              </Card>

              <Card title="Clinic details" {...track('clinic')}>
                <Field
                  label="Department"
                  required
                  error={errors.departmentId}
                  id="departmentId"
                >
                  <SelectField
                    testID="department"
                    value={departmentName ?? null}
                    placeholder="Select department"
                    onPress={() => setPicker({ kind: 'department' })}
                    invalid={!!errors.departmentId}
                  />
                </Field>
                <Field
                  label="OPD room"
                  required
                  error={errors.opdRoom}
                  id="opdRoom"
                >
                  <Input
                    testID="opd-room"
                    value={form.opdRoom}
                    onChangeText={t => set('opdRoom', t)}
                    placeholder="e.g. Room 112"
                    maxLength={30}
                    invalid={!!errors.opdRoom}
                  />
                </Field>
                <View style={formStyles.row}>
                  <Field
                    label="Token prefix"
                    required
                    error={errors.tokenPrefix}
                    id="tokenPrefix"
                    style={formStyles.flex}
                  >
                    <Input
                      testID="token-prefix"
                      value={form.tokenPrefix}
                      onChangeText={t =>
                        set(
                          'tokenPrefix',
                          t
                            .toUpperCase()
                            .replace(/[^A-Z]/g, '')
                            .slice(0, 3),
                        )
                      }
                      placeholder="e.g. C"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={3}
                      invalid={!!errors.tokenPrefix}
                    />
                  </Field>
                  <Field
                    label="Fee (₹)"
                    required
                    error={errors.fee}
                    id="fee"
                    style={formStyles.flex}
                  >
                    <Input
                      testID="fee"
                      value={form.fee}
                      onChangeText={t =>
                        set('fee', t.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="e.g. 500"
                      keyboardType="number-pad"
                      maxLength={6}
                      invalid={!!errors.fee}
                    />
                  </Field>
                </View>
              </Card>

              <Card
                title="OPD schedule"
                right={
                  form.schedule[1].open ? (
                    <Pressable
                      testID="copy-monday"
                      onPress={copyMondayToAll}
                      hitSlop={8}
                      accessibilityRole="button"
                    >
                      <Text style={formStyles.link}>Same as Mon</Text>
                    </Pressable>
                  ) : null
                }
                {...track('schedule')}
              >
                {errors.schedule ? (
                  <Text testID="error-schedule" style={styles.error}>
                    {errors.schedule}
                  </Text>
                ) : null}
                {form.schedule.map((day, weekday) => (
                  <DayRow
                    key={WEEKDAYS[weekday]}
                    weekday={weekday}
                    day={day}
                    error={errors[`schedule-${weekday}`]}
                    onToggle={open => setDay(weekday, { open })}
                    onPick={kind => setPicker({ kind, weekday })}
                    last={weekday === WEEKDAYS.length - 1}
                  />
                ))}
              </Card>
            </>
          ) : (
            <Card title="Clinic details" {...track('clinic')}>
              <Field label="Desk" required error={errors.desk} id="desk">
                <SelectField
                  testID="desk"
                  value={form.desk}
                  placeholder="Select desk"
                  onPress={() => setPicker({ kind: 'desk' })}
                  invalid={!!errors.desk}
                />
              </Field>
              <Field
                label="Assigned doctors"
                required
                error={errors.doctorIds}
                id="doctorIds"
              >
                {options.doctors.length === 0 ? (
                  <Text style={formStyles.hint}>
                    No doctors in this facility yet. Add a doctor first.
                  </Text>
                ) : (
                  <View style={styles.doctorList}>
                    {options.doctors.map(doctor => {
                      const selected = form.doctorIds.includes(doctor.id);
                      return (
                        <Pressable
                          key={doctor.id}
                          testID={`assign-doctor-${doctor.id}`}
                          onPress={() => toggleDoctor(doctor.id)}
                          style={[
                            styles.doctorTile,
                            selected && styles.doctorTileOn,
                          ]}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                        >
                          <View
                            style={[
                              styles.checkbox,
                              selected && styles.checkboxOn,
                            ]}
                          >
                            {selected ? (
                              <Check
                                size={14}
                                color={colors.white}
                                strokeWidth={3}
                              />
                            ) : null}
                          </View>
                          <View style={formStyles.flex}>
                            <Text style={styles.doctorName}>
                              {doctor.fullName}
                            </Text>
                            <Text style={formStyles.hint}>
                              {[doctor.departmentName, doctor.opdRoom]
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </Field>
            </Card>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {submitError ? (
            <Text testID="submit-error" style={styles.error}>
              {submitError}
            </Text>
          ) : null}
          <View style={formStyles.row}>
            <Pressable
              testID="cancel"
              onPress={close}
              disabled={submitting}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && formStyles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="submit-staff"
              onPress={submit}
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || submitting) && formStyles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.primaryText}>
                  {isDoctor ? 'Add doctor' : 'Add assistant'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <SelectSheet
        visible={sheet != null}
        title={sheet?.title ?? ''}
        options={sheet?.options ?? []}
        value={sheet?.value ?? null}
        onPick={value => {
          sheet?.pick(value);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

function Header({
  title,
  subtitle,
  onBack,
  topInset,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  topInset: number;
}) {
  return (
    <View style={[styles.header, { paddingTop: topInset + 10 }]}>
      <Pressable
        testID="back"
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ArrowLeft size={22} color={colors.text} />
      </Pressable>
      <View style={formStyles.flex}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function DayRow({
  weekday,
  day,
  error,
  onToggle,
  onPick,
  last,
}: {
  weekday: number;
  day: DaySchedule;
  error?: string;
  onToggle: (open: boolean) => void;
  onPick: (kind: 'startTime' | 'endTime' | 'slotMinutes') => void;
  last: boolean;
}) {
  const name = WEEKDAYS[weekday];
  return (
    <View
      testID={`day-${weekday}`}
      style={[styles.dayRow, !last && styles.dayDivider]}
    >
      <View style={styles.dayHeader}>
        <Text style={[styles.dayName, !day.open && styles.dayClosed]}>
          {name}
        </Text>
        <Text style={styles.daySummary}>{day.open ? '' : 'Closed'}</Text>
        <Switch
          testID={`day-open-${weekday}`}
          value={day.open}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.white}
          accessibilityLabel={`${name} OPD`}
        />
      </View>
      {day.open ? (
        <>
          <View style={styles.timesRow}>
            <TimeBox
              label="Start"
              value={formatSlotTime(day.startTime)}
              testID={`start-${weekday}`}
              onPress={() => onPick('startTime')}
              invalid={!!error}
            />
            <TimeBox
              label="End"
              value={formatSlotTime(day.endTime)}
              testID={`end-${weekday}`}
              onPress={() => onPick('endTime')}
              invalid={!!error}
            />
            <TimeBox
              label="Slot"
              value={`${day.slotMinutes} min`}
              testID={`slot-${weekday}`}
              onPress={() => onPick('slotMinutes')}
            />
          </View>
          {error ? (
            <Text testID={`error-schedule-${weekday}`} style={styles.error}>
              {error}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function TimeBox({
  label,
  value,
  testID,
  onPress,
  invalid,
}: {
  label: string;
  value: string;
  testID: string;
  onPress: () => void;
  invalid?: boolean;
}) {
  return (
    <View style={formStyles.flex}>
      <Text style={styles.timeLabel}>{label}</Text>
      <SelectField
        testID={testID}
        value={value}
        placeholder={label}
        onPress={onPress}
        invalid={invalid}
        accessibilityLabel={`${label} ${value}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  loadError: { fontSize: 15, color: colors.text, textAlign: 'center' },
  retryButton: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: FORM_RADIUS,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 15, fontWeight: '700', color: colors.white },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.navy },
  subtitle: { marginTop: 1, fontSize: 13, color: colors.muted },

  content: { padding: 16, gap: 14, paddingBottom: 24 },
  prefix: { paddingHorizontal: 12 },
  prefixText: { fontSize: 15, color: colors.text },
  error: { fontSize: 12, color: colors.error },

  // Schedule
  dayRow: { paddingVertical: 10, gap: 8 },
  dayDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  dayHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayName: { width: 44, fontSize: 15, fontWeight: '700', color: colors.text },
  dayClosed: { color: colors.muted },
  daySummary: { flex: 1, fontSize: 13, color: colors.muted },
  timesRow: { flexDirection: 'row', gap: 8 },
  timeLabel: { marginBottom: 4, fontSize: 12, color: colors.muted },

  // Assistant: doctors
  doctorList: { gap: 8 },
  doctorTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  doctorTileOn: {
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
  doctorName: { fontSize: 15, fontWeight: '600', color: colors.text },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
