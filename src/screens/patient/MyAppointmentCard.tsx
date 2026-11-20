import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import type { MyAppointment } from '../../api/myAppointments';
import type { AppointmentStatus } from '../../api/queue';
import { colors } from '../../theme/colors';
import { dateParts } from '../../utils/format';

const STATUS_COLORS: Partial<
  Record<AppointmentStatus, { bg: string; fg: string }>
> = {
  pending: { bg: colors.warningSoft, fg: colors.warningText },
  confirmed: { bg: colors.successSoft, fg: colors.successText },
  checked_in: { bg: colors.successSoft, fg: colors.successText },
  called: { bg: colors.successSoft, fg: colors.successText },
  in_consultation: { bg: colors.successSoft, fg: colors.successText },
  completed: { bg: colors.neutralSoft, fg: colors.neutralText },
};
const CLOSED = { bg: colors.alertSoft, fg: colors.alertLabel };

/** What the patient calls each status (the server's labels are desk wording). */
const PATIENT_LABELS: Partial<Record<AppointmentStatus, string>> = {
  pending: 'Waiting for confirmation',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  called: 'Your turn',
  in_consultation: 'With doctor',
  completed: 'Completed',
};

export const patientStatusLabel = (a: MyAppointment) =>
  PATIENT_LABELS[a.status] ?? a.statusLabel;

const dateOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** One of my appointments: date, doctor, time, token and status. */
export default function MyAppointmentCard({
  appointment: a,
  onPress,
  showPatient = false,
}: {
  appointment: MyAppointment;
  onPress: () => void;
  /** Family accounts: say who the visit is for. */
  showPatient?: boolean;
}) {
  const { weekday, day, month } = dateParts(dateOf(a.opdDate));
  const tone = STATUS_COLORS[a.status] ?? CLOSED;

  return (
    <Pressable
      testID={`my-appointment-${a.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${a.doctor.fullName}, ${weekday} ${day} ${month}`}
    >
      <View style={styles.dateBox}>
        <Text style={styles.dateSmall}>{weekday.toUpperCase()}</Text>
        <Text style={styles.dateDay}>{day}</Text>
        <Text style={styles.dateSmall}>{month.toUpperCase()}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.title} numberOfLines={1}>
          {a.doctor.fullName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[a.department.name, a.slotLabel, a.facility.name]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {showPatient ? (
          <Text style={styles.meta} numberOfLines={1}>
            {`For ${a.patient.fullName}`}
          </Text>
        ) : null}
        <View style={styles.tagRow}>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>
              {patientStatusLabel(a)}
            </Text>
          </View>
          {a.token ? (
            <Text style={styles.token}>{`Token ${a.token.label}`}</Text>
          ) : null}
        </View>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  dateBox: {
    width: 54,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dateSmall: { fontSize: 11, fontWeight: '700', color: colors.primary },
  dateDay: { fontSize: 20, fontWeight: '800', color: colors.navy },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { marginTop: 2, fontSize: 13, color: colors.muted },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  token: { fontSize: 13, fontWeight: '700', color: colors.primary },
});
