import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, CalendarCheck } from 'lucide-react-native';
import {
  bookAppointment,
  getDoctors,
  getFacilities,
  getSlots,
  type DaySlots,
  type Facility,
  type PortalDoctor,
  type SlotDto,
} from '../../api/booking';
import { ApiError } from '../../api/client';
import {
  getMyProfile,
  isPatientMe,
  type PatientProfileDto,
} from '../../api/profile';
import Avatar from '../../components/Avatar';
import type { RootStackParamList } from '../../navigation/types';
import { avatarPalette, colors } from '../../theme/colors';
import {
  dateParts,
  formatSlotTime,
  isSameDay,
  monthName,
} from '../../utils/format';
import { userMessage } from '../../utils/errors';
import { selfProfile } from '../common/profileDetails';
import {
  PROBLEM_SUGGESTIONS,
  buildReason,
  dayCaption,
  departmentIdOf,
  departmentsOf,
  freeSlots,
  isBookable,
  nextOpdDates,
  sessionsLabel,
  toIsoDate,
  visitTypeFor,
} from './bookingHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'BookAppointment'>;

type Load<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

type DayEntry = { date: Date; slots: DaySlots };

const SLOTS_PER_ROW = 3;

/** Slot problems that mean "pick again": reload that day's slots. */
const STALE_SLOT_CODES = ['SLOT_FULL', 'SLOT_PAST', 'SLOT_INVALID'];

/**
 * Patient booking, live from the API:
 * my profiles + clinics → the clinic's doctors (grouped by department)
 * → free slots on the doctor's next OPD days → POST /me/appointments.
 */
export default function BookAppointmentScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [today] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const [account, setAccount] = useState<
    Load<{ profiles: PatientProfileDto[]; facilities: Facility[] }>
  >({ status: 'loading' });
  const [patientId, setPatientId] = useState<number | null>(null);
  const [facilityId, setFacilityId] = useState<number | null>(null);
  const [doctors, setDoctors] = useState<Load<PortalDoctor[]> | null>(null);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [days, setDays] = useState<Load<DayEntry[]> | null>(null);
  const [dateIndex, setDateIndex] = useState<number | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [problemText, setProblemText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The latest choice, so a slow answer for an earlier choice is ignored.
  const latest = useRef<{ facilityId: number | null; doctorId: number | null }>(
    { facilityId: null, doctorId: null },
  );

  /** Loads free slots on the doctor's next OPD days; picks the first free one. */
  const chooseDoctor = useCallback(
    async (doctor: PortalDoctor, fid: number) => {
      latest.current.doctorId = doctor.id;
      setDoctorId(doctor.id);
      setDateIndex(null);
      setSlot(null);
      setError(null);
      const dates = nextOpdDates(doctor.schedule, today);
      if (dates.length === 0) {
        setDays({ status: 'ready', data: [] });
        return;
      }
      setDays({ status: 'loading' });
      try {
        const results = await Promise.all(
          dates.map(d => getSlots(doctor.id, fid, toIsoDate(d))),
        );
        if (latest.current.doctorId !== doctor.id) {
          return;
        }
        const data = dates.map((date, i) => ({ date, slots: results[i] }));
        setDays({ status: 'ready', data });
        const first = data.findIndex(d => freeSlots(d.slots).length > 0);
        if (first >= 0) {
          setDateIndex(first);
          setSlot(freeSlots(data[first].slots)[0].time);
        }
      } catch (e) {
        if (latest.current.doctorId === doctor.id) {
          setDays({
            status: 'error',
            message: userMessage(e, 'Could not load free slots.'),
          });
        }
      }
    },
    [today],
  );

  /** Loads a clinic's doctors and selects the first department's first doctor. */
  const loadDoctors = useCallback(
    async (fid: number) => {
      latest.current = { facilityId: fid, doctorId: null };
      setFacilityId(fid);
      setDoctors({ status: 'loading' });
      setDoctorId(null);
      setDays(null);
      setDateIndex(null);
      setSlot(null);
      try {
        const list = await getDoctors(fid);
        if (latest.current.facilityId !== fid) {
          return;
        }
        setDoctors({ status: 'ready', data: list });
        const department = departmentsOf(list)[0];
        setDepartmentId(department?.id ?? null);
        const first = list.find(d => departmentIdOf(d) === department?.id);
        if (first) {
          await chooseDoctor(first, fid);
        }
      } catch (e) {
        if (latest.current.facilityId === fid) {
          setDoctors({
            status: 'error',
            message: userMessage(e, 'Could not load doctors.'),
          });
        }
      }
    },
    [chooseDoctor],
  );

  /** My patient profiles (who the booking is for) and the clinics. */
  const loadAccount = useCallback(async () => {
    setAccount({ status: 'loading' });
    try {
      const [me, clinics] = await Promise.all([
        getMyProfile(),
        getFacilities(),
      ]);
      if (!isPatientMe(me)) {
        throw new ApiError(
          'Only patient accounts can book appointments here.',
          403,
          'NOT_PATIENT',
        );
      }
      setAccount({
        status: 'ready',
        data: { profiles: me.profiles, facilities: clinics },
      });
      setPatientId(selfProfile(me)?.id ?? null);
      if (me.profiles.length > 0 && clinics.length > 0) {
        await loadDoctors(clinics[0].id);
      }
    } catch (e) {
      setAccount({
        status: 'error',
        message: userMessage(e, 'Could not load booking options.'),
      });
    }
  }, [loadDoctors]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  // Derived selection
  const doctorList = doctors?.status === 'ready' ? doctors.data : [];
  const departments = departmentsOf(doctorList);
  const departmentDoctors = doctorList.filter(
    d => departmentIdOf(d) === departmentId,
  );
  const doctor = doctorList.find(d => d.id === doctorId) ?? null;
  const dayList = days?.status === 'ready' ? days.data : [];
  const day = dateIndex != null ? dayList[dateIndex] ?? null : null;
  const reason = buildReason(tags, problemText);
  const canConfirm =
    !!(doctor && day && slot && patientId != null && facilityId != null) &&
    !submitting;

  const dateLabel = (d: Date) => {
    const { weekday, day: dayNumber } = dateParts(d);
    return `${isSameDay(d, today) ? 'Today' : weekday} ${dayNumber}`;
  };

  const selectDepartment = (id: number) => {
    setDepartmentId(id);
    setError(null);
    const first = doctorList.find(d => departmentIdOf(d) === id);
    if (first && facilityId != null) {
      chooseDoctor(first, facilityId);
    } else {
      latest.current.doctorId = null;
      setDoctorId(null);
      setDays(null);
      setDateIndex(null);
      setSlot(null);
    }
  };
  const selectDate = (index: number) => {
    setDateIndex(index);
    setSlot(freeSlots(dayList[index].slots)[0]?.time ?? null);
  };
  const toggleTag = (tag: string) => {
    setTags(t => (t.includes(tag) ? t.filter(x => x !== tag) : [...t, tag]));
    setError(null);
  };

  /** Fresh slots for one day (e.g. after someone else took the slot). */
  const reloadDay = async (index: number) => {
    if (!doctor || facilityId == null || days?.status !== 'ready') {
      return;
    }
    const entry = days.data[index];
    try {
      const fresh = await getSlots(
        doctor.id,
        facilityId,
        toIsoDate(entry.date),
      );
      if (latest.current.doctorId !== doctor.id) {
        return;
      }
      setDays(prev =>
        prev?.status === 'ready'
          ? {
              status: 'ready',
              data: prev.data.map((d, i) =>
                i === index ? { ...d, slots: fresh } : d,
              ),
            }
          : prev,
      );
      setSlot(current =>
        fresh.slots.some(s => s.time === current && isBookable(s))
          ? current
          : freeSlots(fresh)[0]?.time ?? null,
      );
    } catch {
      // Keep the old slots; the error message already says what happened.
    }
  };

  const confirm = async () => {
    if (
      !canConfirm ||
      !doctor ||
      !day ||
      !slot ||
      patientId == null ||
      facilityId == null
    ) {
      return;
    }
    if (reason.length < 2) {
      setError('Tell us briefly what the problem is.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const booked = await bookAppointment({
        patientId,
        facilityId,
        doctorId: doctor.id,
        date: toIsoDate(day.date),
        slotTime: slot,
        visitType: visitTypeFor(tags),
        reason,
        symptoms: tags,
      });
      const when = `${booked.doctor.fullName} · ${dateLabel(
        day.date,
      )} · ${formatSlotTime(booked.slotTime)}`;
      // The server decides: a token now (confirmed) or later (pending).
      Alert.alert(
        booked.token ? 'Booking confirmed' : 'Booking requested',
        booked.token
          ? `${when}\nYour token: ${booked.token.label}\n\nPlease check in at the OPD desk when you arrive.`
          : `${when}\n\nThe clinic will confirm your booking and give you a token number.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (e) {
      setError(userMessage(e, 'Booking failed. Please try again.'));
      if (
        e instanceof ApiError &&
        STALE_SLOT_CODES.includes(e.code) &&
        dateIndex != null
      ) {
        reloadDay(dateIndex);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const ready = account.status === 'ready' ? account.data : null;
  const facility = ready?.facilities.find(f => f.id === facilityId) ?? null;
  const canBook =
    !!ready && ready.profiles.length > 0 && ready.facilities.length > 0;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          testID="back"
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Book appointment</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {facility ? `${facility.name} · OPD visit` : 'OPD visit'}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        // Edge-to-edge Android doesn't resize for the keyboard: pad instead.
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {account.status === 'loading' ? (
            <Busy testID="account-loading" />
          ) : account.status === 'error' ? (
            <Problem
              testID="account-error"
              message={account.message}
              onRetry={loadAccount}
            />
          ) : !canBook ? (
            <Text testID="cannot-book" style={styles.mutedText}>
              {ready?.profiles.length === 0
                ? 'Your account has no patient profile yet. Please add your details before booking.'
                : 'No clinics are taking bookings right now.'}
            </Text>
          ) : (
            <>
              {/* Who for / which clinic: only when there is a choice */}
              {ready.profiles.length > 1 ? (
                <ChipSection
                  label="Booking for"
                  testIDPrefix="patient"
                  options={ready.profiles.map(p => ({
                    id: p.id,
                    label: p.fullName,
                  }))}
                  value={patientId}
                  onSelect={setPatientId}
                />
              ) : null}
              {ready.facilities.length > 1 ? (
                <ChipSection
                  label="Clinic"
                  testIDPrefix="facility"
                  options={ready.facilities.map(f => ({
                    id: f.id,
                    label: f.name,
                  }))}
                  value={facilityId}
                  onSelect={id => loadDoctors(id)}
                />
              ) : null}

              {doctors?.status === 'loading' ? (
                <Busy testID="doctors-loading" />
              ) : doctors?.status === 'error' ? (
                <Problem
                  testID="doctors-error"
                  message={doctors.message}
                  onRetry={() => facilityId != null && loadDoctors(facilityId)}
                />
              ) : doctorList.length === 0 ? (
                <Text style={styles.mutedText}>
                  No doctors are taking bookings at this clinic yet.
                </Text>
              ) : (
                <>
                  {/* Department */}
                  <ChipSection
                    label="Department"
                    testIDPrefix="dept"
                    options={departments.map(d => ({
                      id: d.id,
                      label: d.name,
                    }))}
                    value={departmentId}
                    onSelect={selectDepartment}
                    dark
                  />

                  {/* Doctor */}
                  <Text style={[styles.sectionLabel, styles.sectionGap]}>
                    Doctor
                  </Text>
                  {departmentDoctors.map((d, i) => (
                    <DoctorCard
                      key={d.id}
                      doctor={d}
                      palette={avatarPalette[i % avatarPalette.length]}
                      selected={d.id === doctorId}
                      onPress={() =>
                        facilityId != null && chooseDoctor(d, facilityId)
                      }
                    />
                  ))}

                  {doctor ? (
                    <>
                      {/* Date */}
                      <Text style={[styles.sectionLabel, styles.sectionGap]}>
                        {`Date · ${monthName(day?.date ?? today)}`}
                      </Text>
                      {days?.status === 'loading' ? (
                        <Busy testID="slots-loading" />
                      ) : days?.status === 'error' ? (
                        <Problem
                          testID="slots-error"
                          message={days.message}
                          onRetry={() =>
                            facilityId != null &&
                            chooseDoctor(doctor, facilityId)
                          }
                        />
                      ) : dayList.length === 0 ? (
                        <Text style={styles.mutedText}>
                          This doctor has no OPD days in the next 3 weeks.
                        </Text>
                      ) : (
                        <View style={styles.dateRow}>
                          {dayList.map((d, i) => {
                            const selected = i === dateIndex;
                            const closed = freeSlots(d.slots).length === 0;
                            const { weekday, day: dayNumber } = dateParts(
                              d.date,
                            );
                            return (
                              <Pressable
                                key={d.slots.date}
                                testID={`date-${i}`}
                                disabled={closed}
                                onPress={() => selectDate(i)}
                                style={[
                                  styles.dateTile,
                                  selected && styles.dateTileSelected,
                                  closed && styles.disabled,
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{
                                  selected,
                                  disabled: closed,
                                }}
                              >
                                <Text
                                  style={[
                                    styles.dateTop,
                                    selected && styles.onBlue,
                                  ]}
                                >
                                  {isSameDay(d.date, today) ? 'Today' : weekday}
                                </Text>
                                <Text
                                  style={[
                                    styles.dateDay,
                                    selected && styles.onBlue,
                                  ]}
                                >
                                  {dayNumber}
                                </Text>
                                <Text
                                  style={[
                                    styles.dateLeft,
                                    selected && styles.onBlue,
                                  ]}
                                >
                                  {dayCaption(d.slots)}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      {/* Time slot */}
                      {day ? (
                        <>
                          <View style={[styles.rowBetween, styles.sectionGap]}>
                            <Text style={styles.sectionLabel}>Time slot</Text>
                            <Text style={styles.mutedSmall}>
                              {sessionsLabel(day.slots.sessions)}
                            </Text>
                          </View>
                          <SlotGrid
                            slots={day.slots.slots}
                            selected={slot}
                            onSelect={time => {
                              setSlot(time);
                              setError(null);
                            }}
                          />
                        </>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}

              {/* Problem */}
              <Text style={[styles.sectionLabel, styles.sectionGap]}>
                {"What's the problem?"}
              </Text>
              <TextInput
                testID="problem-input"
                style={styles.problemInput}
                value={problemText}
                onChangeText={text => {
                  setProblemText(text);
                  setError(null);
                }}
                placeholder="e.g. Fever and body ache since 2 days"
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={200}
                textAlignVertical="top"
              />
              <View style={styles.tagRow}>
                {PROBLEM_SUGGESTIONS.map(tag => {
                  const selected = tags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      testID={`tag-${tag}`}
                      onPress={() => toggleTag(tag)}
                      style={[styles.tag, selected && styles.tagSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text
                        style={[
                          styles.tagText,
                          selected && styles.tagTextSelected,
                        ]}
                      >
                        {tag}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Booking summary */}
              {doctor && day && slot ? (
                <View testID="booking-card" style={styles.previewCard}>
                  <View style={styles.previewHeader}>
                    <CalendarCheck size={16} color={colors.primary} />
                    <Text style={styles.previewTitle}>Your booking</Text>
                  </View>
                  <View style={styles.previewBody}>
                    <View style={styles.previewStats}>
                      <PreviewStat label="Date" value={dateLabel(day.date)} />
                      <PreviewStat
                        label="Time"
                        value={formatSlotTime(slot, false)}
                      />
                      <PreviewStat
                        label="Fee"
                        value={
                          doctor.consultationFee == null
                            ? '—'
                            : `₹${doctor.consultationFee}`
                        }
                      />
                    </View>
                    <Text style={styles.previewNote}>
                      Your token number is shown once the booking is confirmed.
                      Check in at the OPD desk when you arrive.
                    </Text>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {/* Summary + confirm */}
        {canBook ? (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.rowBetween}>
              <Text
                testID="booking-summary"
                style={styles.summary}
                numberOfLines={1}
              >
                {doctor && day && slot
                  ? `${doctor.fullName} · ${dateLabel(
                      day.date,
                    )} · ${formatSlotTime(slot)}`
                  : 'Choose a doctor, date and time'}
              </Text>
              {doctor?.consultationFee != null ? (
                <Text style={styles.fee}>{`₹${doctor.consultationFee}`}</Text>
              ) : null}
            </View>
            {error ? (
              <Text testID="booking-error" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <Pressable
              testID="confirm-booking"
              disabled={!canConfirm}
              onPress={confirm}
              style={({ pressed }) => [
                styles.confirmButton,
                (pressed || submitting) && styles.pressed,
                !canConfirm && !submitting && styles.disabled,
              ]}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm, busy: submitting }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.confirmText}>Confirm booking</Text>
              )}
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function Busy({ testID }: { testID: string }) {
  return (
    <View testID={testID} style={styles.busy}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function Problem({
  testID,
  message,
  onRetry,
}: {
  testID: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <View testID={testID} style={styles.problemBox}>
      <Text style={styles.problemText}>{message}</Text>
      <Pressable
        testID={`${testID}-retry`}
        onPress={onRetry}
        style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Text style={styles.retryText}>Try again</Text>
      </Pressable>
    </View>
  );
}

function ChipSection({
  label,
  testIDPrefix,
  options,
  value,
  onSelect,
  dark,
}: {
  label: string;
  testIDPrefix: string;
  options: { id: number; label: string }[];
  value: number | null;
  onSelect: (id: number) => void;
  /** Navy selected chip (departments); otherwise blue outline. */
  dark?: boolean;
}) {
  return (
    <View style={styles.chipSection}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.departmentRow}
        style={styles.bleed}
      >
        {options.map(option => {
          const selected = option.id === value;
          return (
            <Pressable
              key={option.id}
              testID={`${testIDPrefix}-${option.id}`}
              onPress={() => onSelect(option.id)}
              style={[
                styles.departmentChip,
                selected &&
                  (dark ? styles.departmentChipSelected : styles.tagSelected),
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.departmentText,
                  selected &&
                    (dark
                      ? styles.departmentTextSelected
                      : styles.tagTextSelected),
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DoctorCard({
  doctor: d,
  palette,
  selected,
  onPress,
}: {
  doctor: PortalDoctor;
  palette: { bg: string; fg: string };
  selected: boolean;
  onPress: () => void;
}) {
  const details = [d.qualification, d.specialization || d.departmentName]
    .filter(Boolean)
    .join(' · ');
  const status = d.availability.status;
  return (
    <Pressable
      testID={`doctor-${d.id}`}
      onPress={onPress}
      style={[styles.doctorCard, selected && styles.doctorCardSelected]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Avatar
        name={d.fullName}
        size={44}
        background={palette.bg}
        color={palette.fg}
      />
      <View style={styles.flex}>
        <Text style={styles.doctorName}>{d.fullName}</Text>
        {details ? (
          <Text style={styles.mutedSmall} numberOfLines={1}>
            {details}
          </Text>
        ) : null}
        <Text
          style={[
            styles.availability,
            status === 'off' && styles.availabilityClosed,
            (status === 'late' || status === 'on_break') &&
              styles.availabilityWarn,
          ]}
        >
          {[d.opdDaysLabel, d.availability.label].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

function SlotGrid({
  slots,
  selected,
  onSelect,
}: {
  slots: SlotDto[];
  selected: string | null;
  onSelect: (time: string) => void;
}) {
  const rows: SlotDto[][] = [];
  for (let i = 0; i < slots.length; i += SLOTS_PER_ROW) {
    rows.push(slots.slice(i, i + SLOTS_PER_ROW));
  }
  return (
    <View style={styles.slotGrid}>
      {rows.map(row => (
        <View key={row[0].time} style={styles.slotRow}>
          {row.map(s => {
            const available = isBookable(s);
            const isSelected = s.time === selected;
            const label = formatSlotTime(s.time);
            return (
              <Pressable
                key={s.time}
                testID={`slot-${s.time}`}
                disabled={!available}
                onPress={() => onSelect(s.time)}
                style={[
                  styles.slot,
                  !available && styles.slotUnavailable,
                  isSelected && styles.slotSelected,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  available ? label : `${label}, not available`
                }
                accessibilityState={{
                  selected: isSelected,
                  disabled: !available,
                }}
              >
                <Text
                  style={[
                    styles.slotText,
                    !available && styles.slotTextUnavailable,
                    isSelected && styles.slotTextSelected,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
          {Array.from({ length: SLOTS_PER_ROW - row.length }, (_, i) => (
            <View key={`spacer-${i}`} style={styles.flex} />
          ))}
        </View>
      ))}
    </View>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.previewStat}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue}>{value}</Text>
    </View>
  );
}

const RADIUS = 14;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
  onBlue: { color: colors.white },

  // Header
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

  content: { padding: 16, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.navy,
    marginBottom: 10,
  },
  sectionGap: { marginTop: 22 },
  mutedText: { fontSize: 14, color: colors.muted },
  mutedSmall: { fontSize: 13, color: colors.muted },

  // Loading / errors
  busy: { paddingVertical: 24, alignItems: 'center' },
  problemBox: {
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  problemText: { fontSize: 14, color: colors.text, textAlign: 'center' },
  retryButton: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 14, fontWeight: '700', color: colors.white },

  // Chips (booking for, clinic, department)
  chipSection: { marginBottom: 22 },
  bleed: { marginHorizontal: -16 },
  departmentRow: { paddingHorizontal: 16, gap: 8 },
  departmentChip: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  departmentChipSelected: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  departmentText: { fontSize: 14, fontWeight: '500', color: colors.text },
  departmentTextSelected: { color: colors.white, fontWeight: '700' },

  // Doctor
  doctorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    marginBottom: 10,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  doctorCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.selectedSoft,
  },
  doctorName: { fontSize: 16, fontWeight: '700', color: colors.text },
  availability: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
    color: colors.successText,
  },
  availabilityClosed: { color: colors.muted },
  availabilityWarn: { color: colors.warningText },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },

  // Date
  dateRow: { flexDirection: 'row', gap: 8 },
  dateTile: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  dateTileSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dateTop: { fontSize: 12, color: colors.muted },
  dateDay: { fontSize: 20, fontWeight: '800', color: colors.text },
  dateLeft: { fontSize: 11, color: colors.muted },

  // Slots
  slotGrid: { gap: 10 },
  slotRow: { flexDirection: 'row', gap: 10 },
  slot: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotUnavailable: {
    backgroundColor: colors.slotDisabled,
    borderColor: colors.slotDisabled,
  },
  slotSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotText: { fontSize: 14, fontWeight: '500', color: colors.text },
  slotTextUnavailable: {
    color: colors.placeholder,
    textDecorationLine: 'line-through',
  },
  slotTextSelected: { color: colors.white, fontWeight: '700' },

  // Problem
  problemInput: {
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: colors.text,
  },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tagSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  tagText: { fontSize: 13, color: colors.text },
  tagTextSelected: { color: colors.primary, fontWeight: '600' },

  // Booking summary card
  previewCard: {
    marginTop: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.primarySoft,
  },
  previewTitle: { fontSize: 14, fontWeight: '600', color: colors.primary },
  previewBody: { padding: 16 },
  previewStats: { flexDirection: 'row' },
  previewStat: { flex: 1, alignItems: 'center' },
  previewLabel: { fontSize: 12, color: colors.muted },
  previewValue: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: '800',
    color: colors.navy,
  },
  previewNote: { marginTop: 14, fontSize: 12, color: colors.muted },

  // Footer
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summary: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  fee: { fontSize: 15, fontWeight: '700', color: colors.text },
  error: { fontSize: 13, color: colors.error },
  confirmButton: {
    height: 54,
    borderRadius: RADIUS,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { fontSize: 16, fontWeight: '700', color: colors.white },
});
