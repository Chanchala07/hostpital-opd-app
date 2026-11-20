import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Check,
  Download,
  Pill,
  Share2,
  TriangleAlert,
} from 'lucide-react-native';
import Avatar from '../../components/Avatar';
import type {
  PatientTabParamList,
  RootStackParamList,
} from '../../navigation/types';
import { colors } from '../../theme/colors';
import {
  comingSoon,
  dateParts,
  formatShortDate,
  isSameDay,
} from '../../utils/format';
import {
  DOSE_TIMES,
  getPrescription,
  type DoseTime,
  type PrescribedMedicine,
  type Prescription,
} from './mockPrescription';

type Props = CompositeScreenProps<
  BottomTabScreenProps<PatientTabParamList, 'Prescriptions'>,
  NativeStackScreenProps<RootStackParamList>
>;

const TINTS: Record<PrescribedMedicine['tint'], { bg: string; fg: string }> = {
  blue: { bg: colors.primarySoft, fg: colors.primary },
  purple: { bg: colors.purpleSoft, fg: colors.purple },
  green: { bg: colors.successSoft, fg: colors.success },
};

/** "1-0-1" — the usual way doses are written on Indian prescriptions. */
const doseCode = (m: PrescribedMedicine) =>
  DOSE_TIMES.map(t => m.doses[t.key]).join('-');

function shareText(rx: Prescription): string {
  const { day, month } = dateParts(new Date(rx.visitDate));
  return [
    `Prescription ${rx.id} · ${day} ${month}`,
    `${rx.doctorName} (${rx.department})`,
    `Diagnosis: ${rx.diagnosis}`,
    '',
    ...rx.medicines.map(
      m =>
        `• ${m.name}: ${doseCode(m)}, ${
          m.days
        } days, ${m.instructions.toLowerCase()}`,
    ),
    '',
    ...rx.advice.map(a => `• ${a}`),
    `${rx.warning.lead} ${rx.warning.text}`,
  ].join('\n');
}

export default function PrescriptionScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [rx] = useState(getPrescription);
  const [remindersOn, setRemindersOn] = useState(true);
  const [taken, setTaken] = useState<DoseTime[]>(['morning']);

  const visit = new Date(rx.visitDate);
  const { day, month } = dateParts(visit);
  const doseGroups = DOSE_TIMES.map(t => ({
    ...t,
    medicines: rx.medicines.filter(m => m.doses[t.key] > 0),
  })).filter(g => g.medicines.length > 0);
  const takenCount = doseGroups.filter(g => taken.includes(g.key)).length;

  const toggleTaken = (key: DoseTime) =>
    setTaken(t => (t.includes(key) ? t.filter(k => k !== key) : [...t, key]));

  const share = async () => {
    try {
      await Share.share({
        title: `Prescription ${rx.id}`,
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
          onPress={() => navigation.navigate('Home')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>Your prescription</Text>
          <Text style={styles.subtitle}>
            {`${
              isSameDay(visit, new Date())
                ? "Today's visit"
                : formatShortDate(visit)
            } · ${rx.id}`}
          </Text>
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

      <ScrollView contentContainerStyle={styles.content}>
        {/* Doctor + vitals */}
        <View style={styles.card}>
          <View style={styles.doctorRow}>
            <Avatar name={rx.doctorName} size={48} />
            <View style={styles.flex}>
              <Text style={styles.doctorName}>{rx.doctorName}</Text>
              <Text style={styles.mutedSmall}>
                {`${rx.department} · ${day} ${month} · Token ${rx.token}`}
              </Text>
            </View>
          </View>
          <View style={styles.vitalsRow}>
            <Vital label="Diagnosis" value={rx.diagnosis} />
            <Vital label="Temp" value={rx.temperature} />
            <Vital label="BP" value={rx.bloodPressure} />
          </View>
        </View>

        {/* Medicines */}
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>
            {`Medicines (${rx.medicines.length})`}
          </Text>
          <Pressable
            testID="reminders-toggle"
            onPress={() => setRemindersOn(on => !on)}
            style={styles.reminderButton}
            accessibilityRole="switch"
            accessibilityState={{ checked: remindersOn }}
            accessibilityLabel="Medicine reminders"
          >
            <View style={[styles.track, remindersOn && styles.trackOn]}>
              <View style={[styles.thumb, remindersOn && styles.thumbOn]} />
            </View>
            <Text style={styles.reminderText}>Reminders</Text>
          </Pressable>
        </View>
        {rx.medicines.map(m => (
          <MedicineCard key={m.id} medicine={m} />
        ))}

        {/* Today's doses */}
        <View style={[styles.card, styles.dosesCard]}>
          <View style={[styles.rowBetween, styles.cardHeader]}>
            <Text style={styles.cardTitle}>{"Today's doses"}</Text>
            <Text style={styles.takenCount}>
              {`${takenCount} of ${doseGroups.length} taken`}
            </Text>
          </View>
          {doseGroups.map(g => {
            const done = taken.includes(g.key);
            const names = g.medicines
              .map(m => (g.medicines.length > 2 ? m.shortName : m.name))
              .join(', ');
            return (
              <Pressable
                key={g.key}
                testID={`dose-${g.key}`}
                onPress={() => toggleTaken(g.key)}
                style={[styles.doseRow, done && styles.doseRowDone]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: done }}
              >
                <View style={[styles.checkbox, done && styles.checkboxDone]}>
                  {done ? (
                    <Check size={14} color={colors.white} strokeWidth={3} />
                  ) : null}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.doseTitle}>
                    {`${g.time} · ${g.label}`}
                  </Text>
                  <Text style={styles.mutedSmall} numberOfLines={1}>
                    {names}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Advice */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.cardHeader]}>
            {"Doctor's advice"}
          </Text>
          {rx.advice.map(item => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.adviceText}>{item}</Text>
            </View>
          ))}
          <View style={styles.warningBox}>
            <TriangleAlert size={18} color={colors.alertLabel} />
            <Text style={styles.warningText}>
              <Text style={styles.warningLead}>{`${rx.warning.lead} `}</Text>
              {rx.warning.text}
            </Text>
          </View>
        </View>

        {/* Follow-up */}
        {rx.followUp ? (
          <FollowUpCard
            date={new Date(rx.followUp.date)}
            note={rx.followUp.note}
            onBook={() => navigation.navigate('BookAppointment')}
          />
        ) : null}
      </ScrollView>

      {/* Actions */}
      <View style={styles.footer}>
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
    </View>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.vital}>
      <Text style={styles.vitalLabel}>{label}</Text>
      <Text style={styles.vitalValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MedicineCard({ medicine: m }: { medicine: PrescribedMedicine }) {
  const tint = TINTS[m.tint];
  return (
    <View style={styles.card}>
      <View style={styles.medicineHeader}>
        <View style={[styles.medicineIcon, { backgroundColor: tint.bg }]}>
          <Pill size={20} color={tint.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.medicineName}>{m.name}</Text>
          <Text style={styles.mutedSmall}>{m.detail}</Text>
        </View>
        <View style={styles.medicineDuration}>
          <Text style={styles.medicineDays}>{`${m.days} days`}</Text>
          <Text style={styles.mutedTiny}>{m.instructions}</Text>
        </View>
      </View>
      <View style={styles.doseTiles}>
        {DOSE_TIMES.map(t => {
          const count = m.doses[t.key];
          const active = count > 0;
          return (
            <View
              key={t.key}
              style={[styles.doseTile, active && styles.doseTileActive]}
            >
              <Text
                style={[
                  styles.doseTileLabel,
                  active && styles.doseTileTextActive,
                ]}
              >
                {t.label}
              </Text>
              <Text
                style={[
                  styles.doseTileValue,
                  active && styles.doseTileTextActive,
                ]}
              >
                {active ? String(count) : '—'}
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
    <View style={styles.followUpCard}>
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
  cardHeader: { marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.navy },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  mutedSmall: { fontSize: 13, color: colors.muted },
  mutedTiny: { fontSize: 12, color: colors.muted },

  // Doctor
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

  // Reminders toggle
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  track: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.border,
    padding: 2,
  },
  trackOn: { backgroundColor: colors.primary },
  thumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.white,
  },
  thumbOn: { alignSelf: 'flex-end' },
  reminderText: { fontSize: 14, fontWeight: '500', color: colors.text },

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

  // Today's doses
  dosesCard: { borderColor: colors.primaryBorder },
  takenCount: { fontSize: 13, fontWeight: '600', color: colors.successText },
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  doseRowDone: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  doseTitle: { fontSize: 15, fontWeight: '700', color: colors.text },

  // Advice
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bullet: { fontSize: 15, color: colors.text },
  adviceText: { flex: 1, fontSize: 15, color: colors.text },
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: colors.alertSoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  warningText: { flex: 1, fontSize: 14, color: colors.alertText },
  warningLead: { fontWeight: '700' },

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
    paddingVertical: 12,
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
