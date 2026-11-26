import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Download, Pill, Share2 } from 'lucide-react-native';
import {
  getMyPrescription,
  type MyPrescriptionDetail,
} from '../../api/myPrescriptions';
import type { PrescriptionItem } from '../../api/visits';
import Avatar from '../../components/Avatar';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import { comingSoon, dateParts, formatShortDate } from '../../utils/format';
import { doseLabel, parseFrequency } from '../doctor/prescriptionForm';
import {
  dateOf,
  isOngoing,
  lastDoseDay,
  longDate,
} from './myPrescriptionHelpers';

type Props = NativeStackScreenProps<RootStackParamList, 'Prescription'>;

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rx: MyPrescriptionDetail };

const DOSE_TIMES = ['Morning', 'Afternoon', 'Night'];

const TINTS = [
  { bg: colors.primarySoft, fg: colors.primary },
  { bg: colors.purpleSoft, fg: colors.purple },
  { bg: colors.successSoft, fg: colors.success },
];

const daysText = (n: number) => (n === 1 ? '1 day' : `${n} days`);

function shareText(rx: MyPrescriptionDetail): string {
  const followUp = rx.followUpDate
    ? `Follow-up: ${formatShortDate(dateOf(rx.followUpDate))}`
    : null;
  return [
    `${['Prescription', rx.rxCode].filter(Boolean).join(' ')} · ${longDate(
      rx.date,
    )}`,
    `${rx.doctor.fullName}${
      rx.doctor.departmentName ? ` (${rx.doctor.departmentName})` : ''
    }`,
    `For ${rx.patient.fullName}`,
    rx.diagnosis ? `Diagnosis: ${rx.diagnosis}` : null,
    '',
    ...rx.medicines.map(m =>
      [
        `• ${m.displayName}: ${m.frequency}`,
        daysText(m.durationDays),
        m.timing?.toLowerCase(),
        m.instructions,
      ]
        .filter(Boolean)
        .join(', '),
    ),
    rx.advice ? `\nAdvice: ${rx.advice}` : null,
    rx.testsAdvised.length ? `Tests: ${rx.testsAdvised.join(', ')}` : null,
    followUp,
  ]
    .filter(line => line !== null)
    .join('\n');
}

/** Patient: one prescription from a past (or today's) visit. */
export default function PrescriptionScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { prescriptionId } = route.params;
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  const fetchRx = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      setLoad({ status: 'ready', rx: await getMyPrescription(prescriptionId) });
    } catch (e) {
      setLoad({
        status: 'error',
        message: userMessage(e, 'Could not load this prescription.'),
      });
    }
  }, [prescriptionId]);

  useEffect(() => {
    fetchRx();
  }, [fetchRx]);

  const rx = load.status === 'ready' ? load.rx : null;

  const share = async () => {
    if (!rx) {
      return;
    }
    try {
      await Share.share({
        title: `Prescription ${rx.rxCode ?? ''}`.trim(),
        message: shareText(rx),
      });
    } catch {
      // Sharing was cancelled or isn't available; nothing to do.
    }
  };

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
          <Text style={styles.title}>Prescription</Text>
          {rx ? (
            <Text style={styles.subtitle}>
              {[longDate(rx.date), rx.rxCode].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        <Pressable
          testID="download"
          onPress={() => comingSoon('Download PDF')}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Download prescription"
        >
          <Download size={20} color={colors.text} />
        </Pressable>
      </View>

      {load.status === 'loading' ? (
        <LoadingView label="Loading prescription…" />
      ) : load.status === 'error' ? (
        <ErrorView message={load.message} onRetry={fetchRx} />
      ) : (
        <>
          <PrescriptionBody
            rx={load.rx}
            onBook={() => navigation.navigate('BookAppointment')}
          />
          {/* Actions */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              testID="share"
              onPress={share}
              style={({ pressed }) => [
                styles.footerButton,
                styles.shareButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Share2 size={18} color={colors.text} />
              <Text style={styles.shareText}>Share</Text>
            </Pressable>
            <Pressable
              testID="pharmacy"
              onPress={() => comingSoon('Get from pharmacy')}
              style={({ pressed }) => [
                styles.footerButton,
                styles.pharmacyButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.pharmacyText}>Get from pharmacy</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function PrescriptionBody({
  rx,
  onBook,
}: {
  rx: MyPrescriptionDetail;
  onBook: () => void;
}) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDay = lastDoseDay(rx);
  const ongoing = isOngoing(rx, now);
  const followUp = rx.followUpDate ? dateOf(rx.followUpDate) : null;
  const temp = rx.vitals?.temperatureF;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Doctor + visit */}
      <View testID="rx-visit" style={styles.card}>
        <View style={styles.doctorRow}>
          <Avatar name={rx.doctor.fullName} size={48} />
          <View style={styles.flex}>
            <Text style={styles.doctorName}>{rx.doctor.fullName}</Text>
            <Text style={styles.mutedSmall}>
              {[rx.doctor.departmentName, rx.doctor.qualification]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            <Text style={styles.mutedSmall}>
              {[rx.facility.name, rx.token ? `Token ${rx.token}` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        </View>
        <View style={styles.vitalsRow}>
          <Vital label="Diagnosis" value={rx.diagnosis ?? '—'} />
          <Vital
            label="Temp"
            value={temp != null ? `${temp}°F` : '—'}
            alert={rx.vitals?.hasFever}
          />
          <Vital label="BP" value={rx.vitals?.bp ?? '—'} />
        </View>
        {rx.complaint ? (
          <Text style={styles.visitFor}>
            <Text style={styles.visitForLabel}>Visit for </Text>
            {rx.complaint}
          </Text>
        ) : null}
        <Text style={styles.visitFor}>
          <Text style={styles.visitForLabel}>Patient </Text>
          {`${rx.patient.fullName} · ${rx.patient.patientCode}`}
        </Text>
      </View>

      {/* Medicines */}
      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>
          {`Medicines (${rx.medicines.length})`}
        </Text>
        {lastDay ? (
          <View
            testID="course-status"
            style={[styles.course, ongoing && styles.courseOngoing]}
          >
            <Text
              style={[styles.courseText, ongoing && styles.courseTextOngoing]}
            >
              {ongoing
                ? `Ongoing · till ${formatShortDate(lastDay)}`
                : `Course ended ${formatShortDate(lastDay)}`}
            </Text>
          </View>
        ) : null}
      </View>
      {rx.medicines.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.mutedSmall}>
            No medicines were prescribed at this visit.
          </Text>
        </View>
      ) : (
        rx.medicines.map((m, i) => (
          <MedicineCard key={m.id} medicine={m} index={i} />
        ))
      )}

      {/* Advice + tests */}
      {rx.advice || rx.testsAdvised.length > 0 ? (
        <View testID="rx-advice" style={styles.card}>
          <Text style={[styles.cardTitle, styles.cardHeader]}>
            {"Doctor's advice"}
          </Text>
          {rx.advice ? (
            <Text style={styles.adviceText}>{rx.advice}</Text>
          ) : null}
          {rx.testsAdvised.length > 0 ? (
            <>
              <Text style={styles.testsTitle}>Tests advised</Text>
              {rx.testsAdvised.map(test => (
                <View key={test} style={styles.bulletRow}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.adviceText}>{test}</Text>
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      {/* Follow-up, while it is still ahead */}
      {followUp && followUp.getTime() >= today.getTime() ? (
        <FollowUpCard
          date={followUp}
          note={`Book your visit with ${rx.doctor.fullName}`}
          onBook={onBook}
        />
      ) : null}
    </ScrollView>
  );
}

function Vital({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <View style={styles.vital}>
      <Text style={styles.vitalLabel}>{label}</Text>
      <Text
        style={[styles.vitalValue, alert && styles.alert]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

function MedicineCard({
  medicine: m,
  index,
}: {
  medicine: PrescriptionItem;
  index: number;
}) {
  const tint = TINTS[index % TINTS.length];
  const doses = parseFrequency(m.frequency);
  const detail = [m.form, m.instructions].filter(Boolean).join(' · ');
  return (
    <View testID={`medicine-${index}`} style={styles.card}>
      <View style={styles.medicineHeader}>
        <View style={[styles.medicineIcon, { backgroundColor: tint.bg }]}>
          <Pill size={20} color={tint.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.medicineName}>{m.displayName}</Text>
          {detail ? <Text style={styles.mutedSmall}>{detail}</Text> : null}
        </View>
        <View style={styles.medicineDuration}>
          <Text style={styles.medicineDays}>{daysText(m.durationDays)}</Text>
          {m.timing ? <Text style={styles.mutedTiny}>{m.timing}</Text> : null}
        </View>
      </View>
      <View style={styles.doseTiles}>
        {DOSE_TIMES.map((label, i) => {
          const active = doses[i] > 0;
          return (
            <View
              key={label}
              style={[styles.doseTile, active && styles.doseTileActive]}
            >
              <Text
                style={[
                  styles.doseTileLabel,
                  active && styles.doseTileTextActive,
                ]}
              >
                {label}
              </Text>
              <Text
                style={[
                  styles.doseTileValue,
                  active && styles.doseTileTextActive,
                ]}
              >
                {active ? doseLabel(doses[i]) : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function FollowUpCard({
  date,
  note,
  onBook,
}: {
  date: Date;
  note: string;
  onBook: () => void;
}) {
  const { weekday, day, month } = dateParts(date);
  return (
    <View testID="follow-up" style={styles.followUpCard}>
      <View style={styles.followUpDate}>
        <Text style={styles.followUpSmall}>{weekday.toUpperCase()}</Text>
        <Text style={styles.followUpDay}>{day}</Text>
        <Text style={styles.followUpSmall}>{month.toUpperCase()}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.followUpTitle}>Follow-up visit</Text>
        <Text style={styles.followUpNote}>{note}</Text>
      </View>
      <Pressable
        testID="book-follow-up"
        onPress={onBook}
        style={({ pressed }) => [
          styles.followUpButton,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Book follow-up visit"
      >
        <Text style={styles.followUpButtonText}>Book</Text>
      </Pressable>
    </View>
  );
}

const RADIUS = 16;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  pressed: { opacity: 0.8 },

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
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: { padding: 16, gap: 12, paddingBottom: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardHeader: { marginBottom: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.navy },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  mutedSmall: { fontSize: 13, color: colors.muted },
  mutedTiny: { fontSize: 12, color: colors.muted },
  alert: { color: colors.alertLabel },

  // Doctor + visit
  doctorRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  doctorName: { fontSize: 17, fontWeight: '700', color: colors.text },
  vitalsRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  vital: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  vitalLabel: { fontSize: 12, color: colors.muted },
  vitalValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  visitFor: { marginTop: 10, fontSize: 14, color: colors.text },
  visitForLabel: { color: colors.muted },

  // Course
  course: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.neutralSoft,
  },
  courseOngoing: { backgroundColor: colors.successSoft },
  courseText: { fontSize: 12, fontWeight: '700', color: colors.neutralText },
  courseTextOngoing: { color: colors.successText },

  // Medicine
  medicineHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  medicineIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicineName: { fontSize: 16, fontWeight: '700', color: colors.text },
  medicineDuration: { alignItems: 'flex-end' },
  medicineDays: { fontSize: 15, fontWeight: '700', color: colors.text },
  doseTiles: { flexDirection: 'row', gap: 8, marginTop: 14 },
  doseTile: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: colors.background,
    paddingVertical: 8,
    alignItems: 'center',
  },
  doseTileActive: { backgroundColor: colors.primarySoft },
  doseTileLabel: { fontSize: 12, color: colors.placeholder },
  doseTileValue: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: colors.placeholder,
  },
  doseTileTextActive: { color: colors.primary },

  // Advice
  adviceText: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  testsTitle: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 14,
    fontWeight: '700',
    color: colors.navy,
  },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  bullet: { fontSize: 15, color: colors.text },

  // Follow-up
  followUpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.noteSoft,
    padding: 16,
  },
  followUpDate: {
    width: 56,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  followUpSmall: { fontSize: 11, fontWeight: '700', color: colors.warningText },
  followUpDay: { fontSize: 22, fontWeight: '800', color: colors.noteText },
  followUpTitle: { fontSize: 16, fontWeight: '700', color: colors.noteText },
  followUpNote: { marginTop: 2, fontSize: 13, color: colors.noteText },
  followUpButton: {
    borderRadius: 10,
    backgroundColor: colors.warningText,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  followUpButtonText: { fontSize: 14, fontWeight: '700', color: colors.white },

  // Footer
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerButton: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shareButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  shareText: { fontSize: 15, fontWeight: '600', color: colors.text },
  pharmacyButton: { backgroundColor: colors.primary },
  pharmacyText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
