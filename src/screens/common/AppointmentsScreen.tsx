import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar } from 'lucide-react-native';
import {
  getAppointmentSummary,
  listDayAppointments,
  type DayAppointment,
  type DaySummary,
} from '../../api/appointments';
import { getMyProfile, isPatientMe } from '../../api/profile';
import type { AppointmentStatus } from '../../api/queue';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import { SegmentedTabs, Tag } from '../../components/ListControls';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import {
  comingSoon,
  dateParts,
  formatSlotTime,
  monthName,
} from '../../utils/format';
import { toIsoDate } from '../patient/bookingHelpers';

type TabKey = 'upcoming' | 'done' | 'cancelled';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];

const TAB_STATUSES: Record<TabKey, AppointmentStatus[]> = {
  upcoming: ['pending', 'confirmed', 'checked_in', 'called', 'in_consultation'],
  done: ['completed'],
  cancelled: ['cancelled', 'no_show', 'rescheduled', 'declined'],
};

const EMPTY_TEXT: Record<TabKey, string> = {
  upcoming: 'No upcoming appointments on this day.',
  done: 'No completed visits on this day.',
  cancelled: 'No cancellations on this day.',
};

/** Days shown in the strip, relative to today. */
const DAY_OFFSETS = [-1, 0, 1, 2, 3, 4, 5];

const SECTIONS: {
  key: string;
  label: string;
  match: (a: DayAppointment) => boolean;
}[] = [
  {
    key: 'morning',
    label: 'Morning',
    match: a => !!a.slotTime && a.slotTime < '12:00',
  },
  {
    key: 'afternoon',
    label: 'Afternoon',
    match: a => !!a.slotTime && a.slotTime >= '12:00' && a.slotTime < '17:00',
  },
  {
    key: 'evening',
    label: 'Evening',
    match: a => !!a.slotTime && a.slotTime >= '17:00',
  },
  { key: 'walk_in', label: 'Walk-ins', match: a => !a.slotTime },
];

type Doctor = { id: number; name: string; room: string | null };

type Load<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** "10:15" → { clock: "10:15", period: "AM" }; "12:30" → "12:30" PM. */
function splitTime(time: string) {
  const [clock, period] = formatSlotTime(time).split(' ');
  return { clock, period };
}

const sameStatus = (key: TabKey) => (a: DayAppointment) =>
  TAB_STATUSES[key].includes(a.status);

/**
 * A doctor's appointments for a day, live from the API: the doctor's
 * "Schedule" tab (own appointments) and the assistant's "Bookings" tab
 * (switch between the doctors they work for).
 */
export default function AppointmentsScreen() {
  const insets = useSafeAreaInsets();
  const [today] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [doctors, setDoctors] = useState<
    Load<{ list: Doctor[]; self: boolean }>
  >({ status: 'loading' });
  const [selectedDoctorId, setSelectedDoctorId] = useState<number | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [tab, setTab] = useState<TabKey>('upcoming');
  const [day, setDay] = useState<Load<DayAppointment[]>>({
    status: 'loading',
  });
  const [summary, setSummary] = useState<Map<string, DaySummary>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  /** Only the newest day request may update the screen. */
  const latest = useRef(0);

  const days = useMemo(
    () => DAY_OFFSETS.map(offset => ({ offset, date: addDays(today, offset) })),
    [today],
  );
  const date = (days.find(d => d.offset === dayOffset) ?? days[1]).date;

  const loadDoctors = useCallback(async () => {
    setDoctors({ status: 'loading' });
    try {
      const me = await getMyProfile();
      if (isPatientMe(me)) {
        throw new Error('Not a staff account');
      }
      const list: Doctor[] = me.doctor
        ? [{ id: me.id, name: me.fullName, room: me.doctor.opdRoom }]
        : (me.assistant?.doctors ?? []).map(d => ({
            id: d.id,
            name: d.fullName,
            room: null,
          }));
      setDoctors({ status: 'ready', data: { list, self: !!me.doctor } });
      setSelectedDoctorId(id => id ?? list[0]?.id ?? null);
    } catch (e) {
      setDoctors({
        status: 'error',
        message: userMessage(e, 'Could not load appointments.'),
      });
    }
  }, []);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const ready = doctors.status === 'ready' ? doctors.data : null;
  const doctor =
    ready?.list.find(d => d.id === selectedDoctorId) ?? ready?.list[0] ?? null;
  // A doctor asks for "mine"; the desk names the doctor.
  const doctorParam = ready?.self ? undefined : doctor?.id;
  const doctorKey = doctor?.id;

  const loadDay = useCallback(
    async (quiet: boolean) => {
      if (doctorKey == null) {
        return;
      }
      const request = ++latest.current;
      if (!quiet) {
        setDay({ status: 'loading' });
      }
      try {
        const [list, week] = await Promise.all([
          listDayAppointments(toIsoDate(date), doctorParam),
          getAppointmentSummary(
            toIsoDate(days[0].date),
            toIsoDate(days[days.length - 1].date),
            doctorParam,
          ).catch(() => null), // dots are optional
        ]);
        if (request !== latest.current) {
          return;
        }
        setDay({ status: 'ready', data: list.items });
        if (week) {
          setSummary(new Map(week.days.map(d => [d.date, d])));
        }
      } catch (e) {
        if (request === latest.current && !quiet) {
          setDay({
            status: 'error',
            message: userMessage(e, 'Could not load appointments.'),
          });
        }
      }
    },
    [date, days, doctorKey, doctorParam],
  );

  useEffect(() => {
    loadDay(false);
  }, [loadDay]);

  const refresh = async () => {
    setRefreshing(true);
    await loadDay(true);
    setRefreshing(false);
  };

  const list = day.status === 'ready' ? day.data : [];
  const inTab = (key: TabKey) => list.filter(sameStatus(key));
  const shown = inTab(tab);
  const checkedIn = list.filter(a =>
    ['checked_in', 'called', 'in_consultation'].includes(a.status),
  ).length;
  const notArrived = list.filter(a => a.status === 'confirmed').length;
  const room = doctor?.room ?? list.find(a => a.doctor.opdRoom)?.doctor.opdRoom;

  if (doctors.status === 'loading') {
    return <LoadingView label="Loading appointments…" />;
  }
  if (doctors.status === 'error') {
    return <ErrorView message={doctors.message} onRetry={loadDoctors} />;
  }
  if (!doctor || !ready) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.empty}>No doctors are assigned to you yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header: title, doctor, date strip, tabs */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleRow}>
          <View style={styles.flex}>
            <Text style={styles.title}>Appointments</Text>
            <Text style={styles.subtitle}>
              {[`${monthName(date)} ${date.getFullYear()}`, room]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable
            testID="pick-date"
            onPress={() => comingSoon('Pick a date')}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Pick a date"
          >
            <Calendar size={20} color={colors.text} />
          </Pressable>
        </View>

        {ready.list.length > 1 ? (
          <SegmentedTabs
            testIDPrefix="doctor-tab"
            options={ready.list.map(d => ({ key: d.id, label: d.name }))}
            value={doctor.id}
            onChange={setSelectedDoctorId}
          />
        ) : null}

        <View style={styles.dateStrip}>
          {days.map(d => {
            const selected = d.offset === dayOffset;
            const { weekday, day: dayNumber } = dateParts(d.date);
            const booked = summary.get(toIsoDate(d.date))?.booked ?? 0;
            return (
              <Pressable
                key={d.offset}
                testID={`day-${d.offset}`}
                onPress={() => setDayOffset(d.offset)}
                style={[styles.dateTile, selected && styles.dateTileOn]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${weekday} ${dayNumber}${
                  booked ? `, ${booked} booked` : ''
                }`}
              >
                <Text
                  style={[styles.dateWeekday, selected && styles.dateTextOn]}
                >
                  {weekday}
                </Text>
                <Text style={[styles.dateDay, selected && styles.dateTextOn]}>
                  {dayNumber}
                </Text>
                <View
                  style={[
                    styles.dot,
                    booked > 0 && styles.dotOn,
                    booked > 0 && selected && styles.dotOnSelected,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        <SegmentedTabs
          testIDPrefix="tab"
          options={TABS.map(t => ({
            key: t.key,
            label: `${t.label} · ${inTab(t.key).length}`,
          }))}
          value={tab}
          onChange={setTab}
        />
      </View>

      {day.status === 'loading' ? (
        <LoadingView label="Loading appointments…" testID="day-loading" />
      ) : day.status === 'error' ? (
        <ErrorView
          message={day.message}
          onRetry={() => loadDay(false)}
          testID="day-error"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[colors.primary]}
            />
          }
        >
          <View style={styles.statsRow}>
            <Stat
              label="Booked"
              value={inTab('upcoming').length}
              color={colors.text}
            />
            <Stat
              label="Checked in"
              value={checkedIn}
              color={colors.successText}
            />
            <Stat
              label="Not arrived"
              value={notArrived}
              color={colors.warningText}
            />
          </View>

          {shown.length === 0 ? (
            <Text style={styles.empty}>{EMPTY_TEXT[tab]}</Text>
          ) : (
            SECTIONS.map(section => {
              const items = shown.filter(section.match);
              if (items.length === 0) {
                return null;
              }
              return (
                <View key={section.key} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionLabel}>
                      {section.label.toUpperCase()}
                    </Text>
                    <Text style={styles.sectionHours}>{items.length}</Text>
                  </View>
                  {items.map(a => (
                    <AppointmentCard
                      key={a.id}
                      appointment={a}
                      canReschedule={a.status === 'confirmed' && dayOffset >= 0}
                    />
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AppointmentCard({
  appointment: a,
  canReschedule,
}: {
  appointment: DayAppointment;
  canReschedule: boolean;
}) {
  const time = a.slotTime ? splitTime(a.slotTime) : null;
  const faded = TAB_STATUSES.done
    .concat(TAB_STATUSES.cancelled)
    .includes(a.status);
  const checkedIn = ['checked_in', 'called', 'in_consultation'].includes(
    a.status,
  );

  return (
    <View
      testID={`appointment-${a.id}`}
      style={[
        styles.card,
        checkedIn && styles.cardCheckedIn,
        faded && styles.cardFaded,
      ]}
    >
      <View style={styles.timeColumn}>
        <Text style={styles.clock}>{time?.clock ?? '—'}</Text>
        <Text style={styles.timeSmall}>{time?.period ?? 'Walk-in'}</Text>
        <Text style={[styles.timeSmall, styles.duration]}>
          {`${a.slotMinutes} min`}
        </Text>
      </View>
      <View style={styles.divider} />

      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {a.patient.fullName}
          </Text>
          <View style={styles.tokenBadge}>
            <Text style={styles.tokenText}>{a.token?.label ?? '—'}</Text>
          </View>
        </View>
        <Text style={styles.meta}>
          {`${a.patient.ageGender} · ${a.patient.patientCode}`}
        </Text>
        {a.reason ? <Text style={styles.reason}>{a.reason}</Text> : null}
        <View style={styles.tagRow}>
          <StatusTag status={a.status} label={a.statusLabel} />
          {a.visitType === 'new' ? (
            <Tag text="New patient" bg={colors.purpleSoft} fg={colors.purple} />
          ) : (
            <Tag
              text={a.visitTypeLabel}
              bg={colors.surface}
              fg={colors.text}
              border={colors.border}
            />
          )}
          {a.originalSlotTime && a.originalSlotTime !== a.slotTime ? (
            <Tag
              text={`Moved from ${formatSlotTime(a.originalSlotTime)}`}
              bg={colors.warningSoft}
              fg={colors.warningText}
            />
          ) : null}
          {canReschedule ? (
            <Pressable
              testID={`reschedule-${a.id}`}
              onPress={() => comingSoon(`Reschedule · ${a.patient.fullName}`)}
              hitSlop={8}
              style={styles.reschedule}
              accessibilityRole="button"
              accessibilityLabel={`Reschedule ${a.patient.fullName}`}
            >
              <Text style={styles.rescheduleText}>Reschedule</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function StatusTag({
  status,
  label,
}: {
  status: AppointmentStatus;
  label: string;
}) {
  if (['checked_in', 'called', 'in_consultation'].includes(status)) {
    return <Tag text={label} bg={colors.successSoft} fg={colors.successText} />;
  }
  if (status === 'confirmed') {
    return (
      <Tag
        text="Confirmed"
        bg={colors.tealSoft}
        fg={colors.tealText}
        border={colors.tealText}
      />
    );
  }
  if (status === 'pending') {
    return <Tag text={label} bg={colors.warningSoft} fg={colors.warningText} />;
  }
  if (status === 'completed' || status === 'rescheduled') {
    return (
      <Tag
        text={label}
        bg={colors.surface}
        fg={colors.muted}
        border={colors.border}
      />
    );
  }
  return <Tag text={label} bg={colors.alertSoft} fg={colors.alertLabel} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },

  // Header
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 14,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.navy },
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
  dateStrip: { flexDirection: 'row', gap: 6 },
  dateTile: {
    flex: 1,
    height: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dateTileOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateWeekday: { fontSize: 12, color: colors.muted },
  dateDay: { fontSize: 18, fontWeight: '700', color: colors.text },
  dateTextOn: { color: colors.white },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  dotOn: { backgroundColor: colors.primary },
  dotOnSelected: { backgroundColor: colors.white },

  // Body
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  statsRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { marginTop: 2, fontSize: 12, color: colors.muted },
  empty: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 14,
    color: colors.muted,
  },
  section: { gap: 10, marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.muted,
  },
  sectionHours: { fontSize: 13, fontWeight: '600', color: colors.muted },

  // Card
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  cardCheckedIn: { borderColor: colors.successBorder },
  cardFaded: { opacity: 0.7 },
  timeColumn: { width: 52, alignItems: 'center' },
  clock: { fontSize: 17, fontWeight: '700', color: colors.text },
  timeSmall: { fontSize: 12, color: colors.muted },
  duration: { marginTop: 6 },
  divider: { width: 1, backgroundColor: colors.border },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  tokenBadge: {
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tokenText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  meta: { marginTop: 2, fontSize: 13, color: colors.muted },
  reason: { marginTop: 6, fontSize: 14, color: colors.text },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  reschedule: { marginLeft: 'auto' },
  rescheduleText: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
