import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  CalendarPlus,
  ChevronRight,
  CircleCheck,
  Clock,
  FileText,
  Pill,
  type LucideIcon,
} from 'lucide-react-native';
import type { MyAppointmentDetail } from '../../api/myAppointments';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import NotificationBell from '../../components/NotificationBell';
import { useNotifications } from '../../notifications/NotificationsContext';
import type {
  PatientTabParamList,
  RootStackParamList,
} from '../../navigation/types';
import { colors } from '../../theme/colors';
import { comingSoon } from '../../utils/format';
import { toIsoDate } from './bookingHelpers';
import { getPatientDashboard, type Prescription } from './mockPatientDashboard';
import MyAppointmentCard from './MyAppointmentCard';
import { tokenView } from './myTokenHelpers';
import { usePatientVisits } from './usePatientVisits';

type Props = CompositeScreenProps<
  BottomTabScreenProps<PatientTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

const VISIBLE_MEDICINE_CHIPS = 2;
/** Upcoming visits shown on the home screen (the rest under "See all"). */
const UPCOMING_SHOWN = 2;

export default function PatientDashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  // Medicines, last prescription and health are still sample data.
  const [data, setData] = useState(getPatientDashboard);
  const onFocus = useCallback(
    (cb: () => void) => navigation.addListener('focus', cb),
    [navigation],
  );
  const { visits, reload, refresh } = usePatientVisits(onFocus);
  const [refreshing, setRefreshing] = useState(false);

  const name = user?.name ?? 'Patient';
  const nextMedicine = data.medicines[0];
  const { health } = data;
  const upcoming = visits.status === 'ready' ? visits.upcoming : [];
  const today = visits.status === 'ready' ? visits.today : null;

  const pullToRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const markMedicineTaken = () =>
    setData(d => ({ ...d, medicines: d.medicines.slice(1) }));

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={pullToRefresh}
            colors={[colors.primary]}
            progressViewOffset={insets.top}
          />
        }
      >
        {/* Header + today's visit */}
        <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable
              testID="open-profile"
              onPress={() => navigation.navigate('Profile')}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
            >
              <Avatar
                name={name}
                background={colors.pinkSoft}
                color={colors.pinkText}
              />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.hello}>Hello,</Text>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
            </View>
            <NotificationBell
              hasUnread={unreadCount > 0}
              onPress={() => comingSoon('Notifications')}
            />
          </View>

          {visits.status === 'loading' ? (
            <View style={styles.visitCard} testID="visit-loading">
              <Text style={styles.visitLabel}>{"TODAY'S VISIT"}</Text>
              <ActivityIndicator color={colors.white} />
            </View>
          ) : visits.status === 'error' ? (
            <View style={styles.visitCard} testID="visit-error">
              <Text style={styles.visitLabel}>{"TODAY'S VISIT"}</Text>
              <Text style={styles.turnMeta}>{visits.message}</Text>
              <Pressable
                testID="visit-retry"
                style={({ pressed }) => [
                  styles.trackRow,
                  pressed && styles.pressed,
                ]}
                onPress={reload}
                accessibilityRole="button"
              >
                <Text style={styles.trackText}>Try again</Text>
              </Pressable>
            </View>
          ) : today ? (
            <VisitCard
              visit={today}
              onTrack={() =>
                navigation.navigate('TokenStatus', { appointmentId: today.id })
              }
            />
          ) : (
            <NoVisitCard
              onBook={() => navigation.navigate('BookAppointment')}
            />
          )}
        </View>

        <View style={styles.body}>
          {/* Quick actions */}
          <View style={styles.quickRow}>
            <QuickAction
              icon={CalendarPlus}
              label="Book visit"
              onPress={() => navigation.navigate('BookAppointment')}
            />
            <QuickAction
              icon={Clock}
              label="Live queue"
              onPress={() => navigation.navigate('TokenStatus')}
            />
            <QuickAction
              icon={Pill}
              label="Prescriptions"
              onPress={() => navigation.navigate('Prescriptions')}
            />
            <QuickAction
              icon={FileText}
              label="Reports"
              onPress={() => comingSoon('Reports')}
            />
          </View>

          {/* Medicine reminder */}
          <View style={[styles.card, styles.medicineCard]}>
            {nextMedicine ? (
              <>
                <View style={[styles.medicineIcon, styles.medicineIconDue]}>
                  <Bell size={20} color={colors.purple} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.mutedSmall}>
                    {`Next medicine · ${nextMedicine.time}`}
                  </Text>
                  <Text style={styles.medicineName}>{nextMedicine.name}</Text>
                </View>
                <Pressable
                  testID="mark-taken"
                  style={({ pressed }) => [
                    styles.outlineButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={markMedicineTaken}
                  accessibilityRole="button"
                >
                  <Text style={styles.outlineButtonText}>Mark taken</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View style={[styles.medicineIcon, styles.medicineIconDone]}>
                  <CircleCheck size={20} color={colors.success} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.medicineName}>All done for today</Text>
                  <Text style={styles.mutedSmall}>
                    No more medicines due today.
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Upcoming */}
          <SectionHeader
            title="Upcoming"
            actionLabel="See all"
            testID="see-all-appointments"
            onAction={() => navigation.navigate('MyAppointments')}
          />
          {upcoming.length > 0 ? (
            upcoming
              .slice(0, UPCOMING_SHOWN)
              .map(a => (
                <MyAppointmentCard
                  key={a.id}
                  appointment={a}
                  onPress={() =>
                    navigation.navigate('TokenStatus', { appointmentId: a.id })
                  }
                />
              ))
          ) : visits.status === 'loading' ? (
            <Text style={styles.mutedText}>Loading…</Text>
          ) : (
            <View style={styles.rowBetween}>
              <Text style={styles.mutedText}>No upcoming visits.</Text>
              <Pressable
                testID="see-past-appointments"
                onPress={() =>
                  navigation.navigate('MyAppointments', { tab: 'past' })
                }
                hitSlop={8}
                accessibilityRole="link"
              >
                <Text style={styles.link}>Past visits</Text>
              </Pressable>
            </View>
          )}

          {/* Last prescription */}
          <SectionHeader
            title="Last prescription"
            actionLabel="View"
            onAction={() => navigation.navigate('Prescriptions')}
          />
          {data.lastPrescription ? (
            <PrescriptionCard prescription={data.lastPrescription} />
          ) : (
            <Text style={styles.mutedText}>No prescriptions yet.</Text>
          )}

          {/* Health summary */}
          <View style={styles.healthRow}>
            <HealthTile label="Blood" value={health.bloodGroup} />
            <HealthTile label="Weight" value={`${health.weightKg} kg`} />
            <HealthTile
              label="Allergy"
              value={
                health.allergies.length ? health.allergies.join(', ') : 'None'
              }
              alert={health.allergies.length > 0}
            />
          </View>
        </View>
      </ScrollView>

      {/* Keeps scrolled content from showing through the status bar. */}
      <View style={[styles.statusBarCover, { height: insets.top }]} />
    </View>
  );
}

function VisitCard({
  visit,
  onTrack,
}: {
  visit: MyAppointmentDetail;
  onTrack: () => void;
}) {
  const view = tokenView(visit, toIsoDate(new Date()));
  const q = visit.queueStatus;
  const room = visit.doctor.opdRoom ?? 'OPD';
  const yourTurn =
    visit.status === 'called' ||
    visit.status === 'in_consultation' ||
    !!q?.upNext;
  const ahead =
    q?.peopleAhead != null
      ? `${q.peopleAhead} ${q.peopleAhead === 1 ? 'patient' : 'patients'} ahead`
      : null;

  return (
    <View style={styles.visitCard}>
      <View style={styles.rowBetween}>
        <Text style={styles.visitLabel}>{"TODAY'S VISIT"}</Text>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      <View style={styles.visitRow}>
        <View style={styles.tokenBox}>
          <Text style={styles.tokenLabel}>TOKEN</Text>
          <Text style={styles.tokenValue} testID="visit-token">
            {visit.token?.label ?? '—'}
          </Text>
        </View>
        {yourTurn ? (
          <View style={styles.flex}>
            <Text style={styles.turnLabel}>Please be ready</Text>
            <Text style={styles.turnValue}>{view.banner.title}</Text>
            <Text style={styles.turnMeta}>{`Go to ${room}`}</Text>
          </View>
        ) : q?.late || visit.status === 'pending' ? (
          <View style={styles.flex}>
            <Text style={styles.turnLabel}>{view.banner.title}</Text>
            <Text style={styles.turnMeta}>{view.banner.body}</Text>
          </View>
        ) : (
          <View style={styles.flex}>
            <Text style={styles.turnLabel}>Estimated time</Text>
            <Text style={styles.turnValue} testID="visit-eta">
              {view.estimatedTime}
            </Text>
            <Text style={styles.turnMeta}>
              {ahead ?? `Slot ${visit.slotLabel ?? '—'}`}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.visitDivider} />

      <Pressable
        testID="track-token"
        style={({ pressed }) => [styles.rowBetween, pressed && styles.pressed]}
        onPress={onTrack}
        accessibilityRole="button"
        accessibilityLabel="Track your token"
      >
        <Text style={styles.visitDoctor} numberOfLines={1}>
          {`${visit.doctor.fullName} · ${room}`}
        </Text>
        <View style={styles.trackRow}>
          <Text style={styles.trackText}>Track</Text>
          <ChevronRight size={16} color={colors.white} strokeWidth={2.5} />
        </View>
      </Pressable>
    </View>
  );
}

function NoVisitCard({ onBook }: { onBook: () => void }) {
  return (
    <View style={styles.visitCard}>
      <Text style={styles.visitLabel}>{"TODAY'S VISIT"}</Text>
      <Text style={styles.turnValue}>No visit today</Text>
      <Pressable
        style={({ pressed }) => [styles.trackRow, pressed && styles.pressed]}
        onPress={onBook}
        accessibilityRole="button"
      >
        <Text style={styles.trackText}>Book a visit</Text>
        <ChevronRight size={16} color={colors.white} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.quickAction}
      onPress={onPress}
      accessibilityRole="button"
    >
      {({ pressed }) => (
        <>
          <View style={[styles.quickTile, pressed && styles.pressed]}>
            <Icon size={22} color={colors.primary} />
          </View>
          <Text style={styles.quickLabel} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
  testID,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
  testID?: string;
}) {
  return (
    <View style={[styles.rowBetween, styles.sectionHeader]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable
        testID={testID}
        onPress={onAction}
        hitSlop={8}
        accessibilityRole="link"
      >
        <Text style={styles.link}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

function PrescriptionCard({ prescription }: { prescription: Prescription }) {
  const shown = prescription.medicines.slice(0, VISIBLE_MEDICINE_CHIPS);
  const hidden = prescription.medicines.length - shown.length;

  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>{prescription.diagnosis}</Text>
        <Text style={styles.mutedSmall}>{prescription.date}</Text>
      </View>
      <Text style={[styles.mutedSmall, styles.rxMeta]}>
        {`${prescription.doctorName} · ${prescription.id}`}
      </Text>
      <View style={styles.chipRow}>
        {shown.map(medicine => (
          <View key={medicine} style={styles.chip}>
            <Text style={styles.chipText}>{medicine}</Text>
          </View>
        ))}
        {hidden > 0 ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{`+${hidden} more`}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function HealthTile({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <View style={[styles.healthTile, alert && styles.healthTileAlert]}>
      <Text style={[styles.healthLabel, alert && styles.healthLabelAlert]}>
        {label}
      </Text>
      <Text
        style={[styles.healthValue, alert && styles.healthValueAlert]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const RADIUS = 16;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: { paddingBottom: 24 },
  flex: { flex: 1 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pressed: { opacity: 0.8 },
  statusBarCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.headerBg,
  },

  // Hero
  hero: {
    backgroundColor: colors.headerBg,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    gap: 16,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hello: { fontSize: 13, color: colors.muted },
  name: { fontSize: 18, fontWeight: '700', color: colors.navy },

  // Visit card
  visitCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  visitLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.85)',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#4ADE80',
  },
  liveText: { fontSize: 12, fontWeight: '700', color: colors.white },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tokenBox: {
    backgroundColor: colors.white,
    borderRadius: 14,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.primary,
  },
  tokenValue: { fontSize: 22, fontWeight: '800', color: colors.navy },
  turnLabel: { fontSize: 14, color: colors.white },
  turnValue: { fontSize: 28, fontWeight: '800', color: colors.white },
  turnMeta: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  visitDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  visitDoctor: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trackText: { fontSize: 14, fontWeight: '700', color: colors.white },

  // Body
  body: { padding: 16, gap: 12 },
  quickRow: { flexDirection: 'row', marginTop: 4, marginBottom: 4 },
  quickAction: { flex: 1, alignItems: 'center', gap: 8 },
  quickTile: {
    width: 58,
    height: 58,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 12, fontWeight: '500', color: colors.text },

  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  mutedText: { fontSize: 14, color: colors.muted },
  mutedSmall: { fontSize: 13, color: colors.muted },

  // Medicine
  medicineCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  medicineIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicineIconDue: { backgroundColor: colors.purpleSoft },
  medicineIconDone: { backgroundColor: colors.successSoft },
  medicineName: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#B9D8FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  outlineButtonText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  // Sections
  sectionHeader: { marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },

  // Prescription
  rxMeta: { marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 12, fontWeight: '500', color: colors.chipText },

  // Health
  healthRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  healthTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  healthTileAlert: {
    backgroundColor: colors.alertSoft,
    borderColor: colors.alertBorder,
  },
  healthLabel: { fontSize: 12, color: colors.muted },
  healthLabelAlert: { color: colors.alertLabel },
  healthValue: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  healthValueAlert: { color: colors.alertText },
});
