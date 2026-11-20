import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, Check, RotateCw } from 'lucide-react-native';
import {
  cancelMyAppointment,
  getMyAppointment,
  listMyAppointments,
  type MyAppointmentDetail,
  type StatusStep,
} from '../../api/myAppointments';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import { useNow } from '../../hooks/useNow';
import type { RootStackParamList } from '../../navigation/types';
import { useNotifications } from '../../notifications/NotificationsContext';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import { formatDayTime, formatShortDate } from '../../utils/format';
import { toIsoDate } from './bookingHelpers';
import { pickCurrent, tokenView, type BannerTone } from './myTokenHelpers';
import { appInForeground } from '../../utils/appState';

type Props = NativeStackScreenProps<RootStackParamList, 'TokenStatus'>;

/** How often today's token refreshes while the screen is open. */
export const TOKEN_POLL_MS = 15 * 1000;

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'none' }
  | { status: 'ready'; appointment: MyAppointmentDetail; updatedAt: number };

type StepState = 'done' | 'current' | 'upcoming';

const dateOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Patient: live status of today's (or the next) appointment. */
export default function MyTokenScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const now = useNow(30 * 1000);
  const { latest } = useNotifications();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /** The appointment being tracked (picked once, or passed in). */
  const trackedId = useRef<number | null>(route.params?.appointmentId ?? null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const fetchCurrent = useCallback(async () => {
    if (trackedId.current == null) {
      const list = await listMyAppointments('upcoming');
      trackedId.current = pickCurrent(list, toIsoDate(new Date()))?.id ?? null;
    }
    if (trackedId.current == null) {
      return null;
    }
    return getMyAppointment(trackedId.current);
  }, []);

  const firstLoad = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const appointment = await fetchCurrent();
      if (mounted.current) {
        setLoad(
          appointment
            ? { status: 'ready', appointment, updatedAt: Date.now() }
            : { status: 'none' },
        );
      }
    } catch (e) {
      if (mounted.current) {
        setLoad({
          status: 'error',
          message: userMessage(e, 'Could not load your token.'),
        });
      }
    }
  }, [fetchCurrent]);

  /** Quiet refresh: keeps what's shown if it fails. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const appointment = await fetchCurrent();
      if (mounted.current && appointment) {
        setLoad({ status: 'ready', appointment, updatedAt: Date.now() });
      }
    } catch {
      // Try again on the next poll.
    } finally {
      if (mounted.current) {
        setRefreshing(false);
      }
    }
  }, [fetchCurrent]);

  useEffect(() => {
    firstLoad();
  }, [firstLoad]);

  const today = toIsoDate(now);
  const view =
    load.status === 'ready' ? tokenView(load.appointment, today) : null;
  const live = view?.live ?? false;

  // Keep today's token fresh while it can still change.
  useEffect(() => {
    if (!live) {
      return;
    }
    const timer = setInterval(() => {
      if (appInForeground()) {
        refresh();
      }
    }, TOKEN_POLL_MS);
    return () => clearInterval(timer);
  }, [live, refresh]);

  // "Your turn is next" / "time moved" arrived: show it straight away.
  const latestId = latest?.id;
  useEffect(() => {
    if (latestId != null && trackedId.current != null) {
      refresh();
    }
  }, [latestId, refresh]);

  const cancel = (a: MyAppointmentDetail) =>
    Alert.alert(
      'Cancel appointment?',
      `${a.doctor.fullName} · ${formatShortDate(dateOf(a.opdDate))}${
        a.slotLabel ? `, ${a.slotLabel}` : ''
      }`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Cancel appointment',
          style: 'destructive',
          onPress: async () => {
            setCancelling(true);
            try {
              const updated = await cancelMyAppointment(a.id);
              if (mounted.current) {
                setLoad({
                  status: 'ready',
                  appointment: updated,
                  updatedAt: Date.now(),
                });
              }
            } catch (e) {
              Alert.alert(
                'Could not cancel',
                userMessage(e, 'Please try again.'),
              );
            } finally {
              if (mounted.current) {
                setCancelling(false);
              }
            }
          },
        },
      ],
    );

  const appointment = load.status === 'ready' ? load.appointment : null;

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title}>My token</Text>
          {appointment ? (
            <Text style={styles.subtitle}>
              {`${formatShortDate(dateOf(appointment.opdDate))} · ${
                appointment.appointmentCode
              }`}
            </Text>
          ) : null}
        </View>
        {appointment ? (
          <Pressable
            testID="refresh"
            onPress={refresh}
            disabled={refreshing}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Refresh"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <RotateCw size={20} color={colors.text} />
            )}
          </Pressable>
        ) : null}
      </View>

      {load.status === 'loading' ? (
        <LoadingView label="Loading your token…" testID="token-loading" />
      ) : load.status === 'error' ? (
        <ErrorView
          message={load.message}
          onRetry={firstLoad}
          testID="token-error"
        />
      ) : load.status === 'none' || !appointment || !view ? (
        <View testID="no-token" style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No upcoming visit</Text>
          <Text style={styles.emptyText}>
            Book an appointment and your token will show here.
          </Text>
          <Pressable
            testID="book-now"
            onPress={() => navigation.replace('BookAppointment')}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Book appointment</Text>
          </Pressable>
          <Pressable
            testID="see-past"
            onPress={() => navigation.replace('MyAppointments', { tab: 'past' })}
            hitSlop={8}
            style={styles.secondaryLink}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryLinkText}>See past appointments</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[colors.primary]}
            />
          }
        >
          {/* What's happening now */}
          <Banner tone={view.banner.tone} testID="token-banner">
            <Text style={[styles.bannerTitle, toneText[view.banner.tone]]}>
              {view.banner.title}
            </Text>
            {view.banner.body ? (
              <Text style={[styles.bannerBody, toneText[view.banner.tone]]}>
                {view.banner.body}
              </Text>
            ) : null}
          </Banner>

          {/* Token card */}
          <View style={styles.tokenCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.statusLabel} testID="token-headline">
                {view.headline}
              </Text>
              {view.live ? (
                <View style={styles.updatedPill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.updatedText}>
                    {updatedLabel(now.getTime(), load.updatedAt)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.yourTokenLabel}>YOUR TOKEN</Text>
            <Text style={styles.tokenValue} testID="token-value">
              {appointment.token?.label ?? '—'}
            </Text>
            <View style={styles.statsBox}>
              <TokenStat
                label="Est. time"
                value={view.estimatedTime}
                valueID="stat-eta"
              />
              <View style={styles.statDivider} />
              <TokenStat
                label="Ahead"
                value={view.ahead}
                valueID="stat-ahead"
              />
              <View style={styles.statDivider} />
              <TokenStat
                label="Position"
                value={view.position}
                valueID="stat-position"
              />
            </View>
            <Text style={styles.tokenFooter}>
              {[
                appointment.doctor.fullName,
                appointment.doctor.opdRoom,
                appointment.facility.name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>

          {/* Place in the queue */}
          {view.queueNote ? (
            <View style={styles.card}>
              <Text style={[styles.cardTitle, styles.cardHeader]}>
                Your place in the queue
              </Text>
              {appointment.slotLabel ? (
                <Text style={styles.slotText}>
                  {`Slot ${appointment.slotLabel}`}
                </Text>
              ) : null}
              <View style={styles.notifyNote}>
                <Bell size={16} color={colors.primary} />
                <Text style={styles.notifyText} testID="queue-note">
                  {view.queueNote}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Visit progress */}
          <View style={styles.card}>
            <Text style={[styles.cardTitle, styles.cardHeader]}>
              Visit progress
            </Text>
            <Steps steps={appointment.steps} />
          </View>

          {view.canCancel ? (
            <Pressable
              testID="cancel-appointment"
              disabled={cancelling}
              onPress={() => cancel(appointment)}
              style={({ pressed }) => [
                styles.cancelButton,
                (pressed || cancelling) && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.cancelText}>
                {cancelling ? 'Cancelling…' : 'Cancel appointment'}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function updatedLabel(nowMs: number, updatedAt: number) {
  // `now` ticks every 30 s, so it can lag a fresh update: round and clamp.
  const minutes = Math.max(0, Math.round((nowMs - updatedAt) / 60000));
  return minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`;
}

const STEP_HINTS: Record<StatusStep['key'], string> = {
  booked: '',
  confirmed: 'Waiting for the clinic',
  checked_in: 'Check in at the desk when you arrive',
  in_consultation: 'When the doctor calls you in',
};

function Steps({ steps }: { steps: StatusStep[] }) {
  const currentStep = steps.findIndex(s => !s.done);
  const stateOf = (i: number): StepState =>
    steps[i].done ? 'done' : i === currentStep ? 'current' : 'upcoming';

  return (
    <>
      {steps.map((step, i) => {
        const state = stateOf(i);
        const isLast = i === steps.length - 1;
        return (
          <View
            key={step.key}
            style={styles.stepRow}
            testID={`step-${step.key}`}
          >
            <View style={styles.stepRail}>
              <View
                style={[
                  styles.stepDot,
                  state === 'done' && styles.stepDotDone,
                  state === 'current' && styles.stepDotCurrent,
                ]}
              >
                {state === 'done' ? (
                  <Check size={10} color={colors.white} strokeWidth={3} />
                ) : null}
              </View>
              {!isLast ? (
                <View
                  style={[
                    styles.stepLine,
                    state === 'done' && styles.stepLineDone,
                  ]}
                />
              ) : null}
            </View>
            <View style={[styles.stepBody, !isLast && styles.stepBodyGap]}>
              <Text
                style={[
                  styles.stepTitle,
                  state === 'current' && styles.stepTitleCurrent,
                  state === 'upcoming' && styles.stepTitleUpcoming,
                ]}
              >
                {step.label}
              </Text>
              <Text
                style={[
                  styles.stepDetail,
                  state === 'upcoming' && styles.stepDetailUpcoming,
                ]}
              >
                {step.done && step.at
                  ? formatDayTime(new Date(step.at))
                  : STEP_HINTS[step.key]}
              </Text>
            </View>
          </View>
        );
      })}
    </>
  );
}

function Banner({
  tone,
  testID,
  children,
}: {
  tone: BannerTone;
  testID: string;
  children: React.ReactNode;
}) {
  return (
    <View
      testID={testID}
      style={[styles.banner, toneBox[tone]]}
      accessibilityLiveRegion="polite"
    >
      {children}
    </View>
  );
}

function TokenStat({
  label,
  value,
  valueID,
}: {
  label: string;
  value: string;
  /** testID of the value text */
  valueID: string;
}) {
  return (
    <View style={styles.tokenStat}>
      <Text style={styles.tokenStatLabel}>{label}</Text>
      <Text style={styles.tokenStatValue} testID={valueID}>
        {value}
      </Text>
    </View>
  );
}

const RADIUS = 16;

const toneBox = StyleSheet.create({
  success: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  info: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryBorder,
  },
  warning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
});

const toneText = StyleSheet.create({
  success: { color: colors.successText },
  info: { color: colors.chipText },
  warning: { color: colors.warningText },
  danger: { color: colors.danger },
});

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

  content: { padding: 16, gap: 14 },

  // Empty
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  primaryButton: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: { fontSize: 15, fontWeight: '700', color: colors.white },
  secondaryLink: { marginTop: 8 },
  secondaryLinkText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  // Banner
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  bannerTitle: { fontSize: 15, fontWeight: '700' },
  bannerBody: { fontSize: 13, lineHeight: 19 },

  // Token card
  tokenCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 18,
    alignItems: 'stretch',
  },
  statusLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.9)',
  },
  updatedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  updatedText: { fontSize: 12, fontWeight: '600', color: colors.white },
  yourTokenLabel: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.9)',
  },
  tokenValue: {
    textAlign: 'center',
    fontSize: 64,
    lineHeight: 74,
    fontWeight: '800',
    color: colors.white,
  },
  statsBox: {
    flexDirection: 'row',
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
  },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },
  tokenStat: { flex: 1, alignItems: 'center' },
  tokenStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  tokenStatValue: {
    marginTop: 2,
    fontSize: 19,
    fontWeight: '800',
    color: colors.white,
  },
  tokenFooter: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardHeader: { marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.navy },
  slotText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 10,
  },
  notifyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notifyText: { flex: 1, fontSize: 13, color: colors.chipText },

  // Progress
  stepRow: { flexDirection: 'row', gap: 12 },
  stepRail: { width: 18, alignItems: 'center' },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  stepDotCurrent: { borderColor: colors.primary, borderWidth: 3 },
  stepLine: {
    flex: 1,
    width: 2,
    marginVertical: 2,
    backgroundColor: colors.border,
  },
  stepLineDone: { backgroundColor: colors.success },
  stepBody: { flex: 1 },
  stepBodyGap: { paddingBottom: 16 },
  stepTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  stepTitleCurrent: { color: colors.primary },
  stepTitleUpcoming: { color: colors.placeholder },
  stepDetail: { marginTop: 1, fontSize: 13, color: colors.muted },
  stepDetailUpcoming: { color: colors.placeholder },

  // Cancel
  cancelButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
