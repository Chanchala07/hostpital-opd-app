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
import { ArrowLeft, Check, Volume1 } from 'lucide-react-native';
import * as queueApi from '../../api/queue';
import type { QueueSnapshot, VisitSummary } from '../../api/queue';
import Avatar from '../../components/Avatar';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { appInForeground } from '../../utils/appState';
import { userMessage } from '../../utils/errors';
import { formatShortDate, formatTime } from '../../utils/format';

type Props = NativeStackScreenProps<RootStackParamList, 'VisitDone'>;

/** How often "Up next" refreshes while the screen is open. */
export const VISIT_DONE_POLL_MS = 15 * 1000;

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; summary: VisitSummary; queue: QueueSnapshot };

/** "2026-10-15" → "Thu, 15 Oct" */
function dayLabel(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return formatShortDate(new Date(y, m - 1, d));
}

/**
 * Doctor, after "Visit complete": what was done for the patient, who is up
 * next, and "Call next patient" / "Take a break" / "Back to dashboard".
 */
export default function VisitDoneScreen({ navigation, route }: Props) {
  const { visitId } = route.params;
  const insets = useSafeAreaInsets();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const fetchAll = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const [summary, queue] = await Promise.all([
        queueApi.getVisitSummary(visitId),
        queueApi.getQueue(),
      ]);
      if (mounted.current) {
        setLoad({ status: 'ready', summary, queue });
      }
    } catch (e) {
      if (mounted.current) {
        setLoad({
          status: 'error',
          message: userMessage(e, 'Could not load this visit.'),
        });
      }
    }
  }, [visitId]);

  /** Only "Up next" changes: the visit itself is closed. */
  const refreshQueue = useCallback(async () => {
    try {
      const queue = await queueApi.getQueue();
      if (mounted.current) {
        setLoad(l => (l.status === 'ready' ? { ...l, queue } : l));
      }
    } catch {
      // Offline for a moment: keep what is shown.
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (appInForeground()) {
        refreshQueue();
      }
    }, VISIT_DONE_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshQueue]);

  const refresh = async () => {
    setRefreshing(true);
    await refreshQueue();
    setRefreshing(false);
  };

  /** Runs a queue action; 'leave' goes back to the dashboard. */
  const run = async (action: () => Promise<'leave' | 'stay'>) => {
    setBusy(true);
    let next: 'leave' | 'stay' = 'stay';
    try {
      next = await action();
    } catch (e) {
      Alert.alert('Could not update', userMessage(e, 'Please try again.'));
    }
    if (!mounted.current) {
      return;
    }
    setBusy(false);
    if (next === 'leave') {
      navigation.goBack(); // the dashboard refetches when it is back in view
    } else {
      await refreshQueue();
    }
  };

  const callNext = () =>
    run(async () => {
      const result = await queueApi.callNext();
      if (result.data === null) {
        Alert.alert('No one is waiting', result.message);
        return 'stay';
      }
      return 'leave';
    });

  const toggleBreak = (queue: QueueSnapshot) => {
    const available = queue.doctor.availability.status === 'available';
    return run(async () => {
      await queueApi.setAvailability(
        queue.doctor.id,
        available ? 'on_break' : 'available',
      );
      return available ? 'leave' : 'stay';
    });
  };

  const ready = load.status === 'ready' ? load : null;

  return (
    <View style={styles.screen}>
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
          <Text style={styles.title}>Visit completed</Text>
          {ready ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {[
                ready.queue.doctor.opdRoom,
                dayLabel(ready.summary.visit.visitDate),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
        </View>
        {ready ? (
          <View style={styles.seenPill}>
            <Text style={styles.seenText} testID="seen-count">
              {`${ready.queue.stats.seen} of ${ready.queue.stats.total} seen`}
            </Text>
          </View>
        ) : null}
      </View>

      {load.status === 'loading' ? (
        <LoadingView label="Loading visit…" testID="visit-loading" />
      ) : load.status === 'error' ? (
        <ErrorView
          message={load.message}
          onRetry={fetchAll}
          testID="visit-error"
        />
      ) : (
        <>
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
            <SummaryCard
              summary={load.summary}
              visitTypeLabel={
                load.queue.items.find(
                  a => a.id === load.summary.visit.appointmentId,
                )?.visitTypeLabel
              }
            />
            <UpNextCard queue={load.queue} />
          </ScrollView>

          <Footer
            queue={load.queue}
            busy={busy}
            bottomInset={insets.bottom}
            onCallNext={callNext}
            onToggleBreak={() => toggleBreak(load.queue)}
            onBack={() => navigation.goBack()}
          />
        </>
      )}
    </View>
  );
}

function SummaryCard({
  summary,
  visitTypeLabel,
}: {
  summary: VisitSummary;
  visitTypeLabel?: string;
}) {
  const { visit, patient, prescription } = summary;
  const medicines = prescription?.items.length ?? 0;
  const start = visit.startedAt ? new Date(visit.startedAt) : null;
  const end = visit.completedAt ? new Date(visit.completedAt) : null;
  const minutes = visit.durationMinutes;

  return (
    <View style={styles.summaryCard} testID="visit-summary">
      <View style={styles.hero}>
        <View style={styles.checkRing}>
          <View style={styles.checkCircle}>
            <Check size={30} color={colors.white} strokeWidth={3} />
          </View>
        </View>
        <Text style={styles.heroTitle}>Visit completed</Text>
        {visit.token ? (
          <Text style={styles.heroCaption}>
            {'for token '}
            <Text style={styles.heroToken}>{visit.token}</Text>
          </Text>
        ) : null}
      </View>

      <View style={styles.patientRow}>
        <Avatar
          name={patient.fullName}
          size={48}
          background={colors.pinkSoft}
          color={colors.pinkText}
        />
        <View style={styles.flex}>
          <Text style={styles.patientName} numberOfLines={1}>
            {patient.fullName}
          </Text>
          <Text style={styles.mutedSmall} numberOfLines={1}>
            {[patient.ageGender, patient.patientCode, visitTypeLabel]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {minutes != null ? (
          <View style={styles.duration}>
            <Text style={styles.durationValue} testID="visit-duration">
              {minutes < 1 ? '< 1 min' : `${minutes} min`}
            </Text>
            {start && end ? (
              <Text style={styles.durationRange}>
                {`${formatTime(start, false)} – ${formatTime(end, false)}`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.details}>
        <Detail label="Diagnosis" value={visit.diagnosis || '—'} />
        <Detail
          label="Medicines"
          value={medicines ? `${medicines} prescribed` : 'None'}
        />
        <Detail label="Rx number" value={prescription?.rxCode ?? '—'} />
        <Detail
          label="Follow-up"
          value={visit.followUpDate ? dayLabel(visit.followUpDate) : 'Not set'}
          highlight={visit.followUpDate != null}
        />
      </View>
    </View>
  );
}

function Detail({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[styles.detailValue, highlight && styles.detailHighlight]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

/** The patient the doctor sees next: already called in, or first waiting. */
function UpNextCard({ queue }: { queue: QueueSnapshot }) {
  const inRoom = queue.nowServing;
  const next = inRoom ?? queue.waiting[0] ?? null;

  if (!next) {
    const notArrived = queue.stats.notArrived;
    return (
      <View style={styles.upNextCard} testID="up-next">
        <Text style={styles.upNextLabel}>UP NEXT</Text>
        <Text style={styles.mutedText}>
          {notArrived > 0
            ? `No one is waiting. ${notArrived} booked, not arrived yet.`
            : 'No one is waiting.'}
        </Text>
      </View>
    );
  }

  const waited = next.queue.waitingMinutes;
  const pill = inRoom
    ? null
    : waited != null && waited > 0
    ? `Checked in · waiting ${waited} min`
    : 'Checked in';

  return (
    <View style={styles.upNextCard} testID="up-next">
      <View style={styles.rowBetween}>
        <Text style={styles.upNextLabel}>
          {!inRoom
            ? 'UP NEXT'
            : inRoom.status === 'in_consultation'
            ? 'IN YOUR ROOM'
            : 'CALLED IN'}
        </Text>
        {pill ? (
          <View style={styles.waitPill}>
            <Text style={styles.waitText}>{pill}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.nextRow}>
        <View style={styles.tokenBox}>
          <Text style={styles.tokenLabel}>TOKEN</Text>
          <Text style={styles.tokenValue}>{next.token?.label ?? '—'}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.nextName} numberOfLines={1}>
            {next.patient.fullName}
          </Text>
          <Text style={styles.mutedSmall} numberOfLines={1}>
            {[
              next.patient.ageGender,
              next.visitTypeLabel,
              next.slotLabel ? `${next.slotLabel} slot` : 'Walk-in',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {next.reason ? (
            <Text style={styles.reason} numberOfLines={2}>
              {next.reason}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Footer({
  queue,
  busy,
  bottomInset,
  onCallNext,
  onToggleBreak,
  onBack,
}: {
  queue: QueueSnapshot;
  busy: boolean;
  bottomInset: number;
  onCallNext: () => void;
  onToggleBreak: () => void;
  onBack: () => void;
}) {
  const { status } = queue.doctor.availability;
  const available = status === 'available';
  // Someone already called in (e.g. by the desk): nothing to call.
  const next = queue.nowServing ? null : queue.waiting[0] ?? null;

  return (
    <View style={[styles.footer, { paddingBottom: bottomInset + 12 }]}>
      {next ? (
        <Pressable
          testID="call-next"
          disabled={busy || !available}
          onPress={onCallNext}
          style={({ pressed }) => [
            styles.callButton,
            (pressed || busy || !available) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || !available }}
        >
          {busy ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Volume1 size={20} color={colors.white} strokeWidth={2.4} />
              <Text style={styles.callText}>
                {`Call next patient · ${next.token?.label ?? ''}`.trim()}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}
      {next && !available ? (
        <Text style={styles.breakNote}>
          You're on break. End the break to call the next patient.
        </Text>
      ) : null}
      <View style={styles.footerRow}>
        <Pressable
          testID="break-toggle"
          disabled={busy}
          onPress={onToggleBreak}
          style={({ pressed }) => [
            styles.outlineButton,
            (pressed || busy) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
        >
          <Text style={styles.outlineText}>
            {available
              ? 'Take a break'
              : status === 'on_break'
              ? 'End break'
              : 'Set available'}
          </Text>
        </Pressable>
        <Pressable
          testID="back-to-dashboard"
          onPress={onBack}
          style={({ pressed }) => [
            styles.outlineButton,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.outlineText}>Back to dashboard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  pressed: { opacity: 0.7 },
  mutedText: { fontSize: 14, color: colors.muted },
  mutedSmall: { marginTop: 2, fontSize: 13, color: colors.muted },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.navy },
  subtitle: { marginTop: 1, fontSize: 13, color: colors.muted },
  seenPill: {
    backgroundColor: colors.neutralSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  seenText: { fontSize: 12, fontWeight: '600', color: colors.neutralText },

  content: { padding: 16, gap: 16, paddingBottom: 24 },

  // Summary
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.successBorder,
    overflow: 'hidden',
  },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.successSoft,
    paddingTop: 22,
    paddingBottom: 20,
    gap: 6,
  },
  checkRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(22, 163, 74, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  checkCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 21, fontWeight: '800', color: '#14532D' },
  heroCaption: { fontSize: 14, color: colors.successText },
  heroToken: { fontWeight: '800', color: '#14532D' },
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  patientName: { fontSize: 17, fontWeight: '700', color: colors.text },
  duration: { alignItems: 'flex-end' },
  durationValue: { fontSize: 20, fontWeight: '800', color: colors.navy },
  durationRange: { marginTop: 1, fontSize: 12, color: colors.muted },
  details: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  detail: { width: '50%', paddingVertical: 6, paddingRight: 8 },
  detailLabel: { fontSize: 12, color: colors.muted },
  detailValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  detailHighlight: { color: colors.warningText },

  // Up next
  upNextCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: 16,
    gap: 12,
  },
  upNextLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.primary,
  },
  waitPill: {
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  waitText: { fontSize: 12, fontWeight: '600', color: colors.warningText },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tokenBox: {
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.85)',
  },
  tokenValue: { fontSize: 19, fontWeight: '800', color: colors.white },
  nextName: { fontSize: 17, fontWeight: '700', color: colors.text },
  reason: { marginTop: 4, fontSize: 14, color: colors.text },

  // Footer
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  callButton: {
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  callText: { fontSize: 16, fontWeight: '700', color: colors.white },
  breakNote: { fontSize: 13, color: colors.warningText, textAlign: 'center' },
  footerRow: { flexDirection: 'row', gap: 10 },
  outlineButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
