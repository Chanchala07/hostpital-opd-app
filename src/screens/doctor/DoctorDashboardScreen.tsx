import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Calendar,
  Check,
  Clock,
  FileText,
  Pill,
  UserX,
  Volume1,
  type LucideIcon,
} from 'lucide-react-native';
import type { ApiResult } from '../../api/client';
import * as queueApi from '../../api/queue';
import type { QueueCard, QueueSnapshot } from '../../api/queue';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import NotificationBell from '../../components/NotificationBell';
import { useNow } from '../../hooks/useNow';
import type {
  DoctorTabParamList,
  RootStackParamList,
} from '../../navigation/types';
import { useNotifications } from '../../notifications/NotificationsContext';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import {
  comingSoon,
  formatShortDate,
  formatSlotTime,
  greetingFor,
} from '../../utils/format';
import { appInForeground } from '../../utils/appState';

type Props = CompositeScreenProps<
  BottomTabScreenProps<DoctorTabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

/** How often the doctor's queue refreshes while the app is open. */
export const DOCTOR_POLL_MS = 15 * 1000;
const UP_NEXT_LIMIT = 3;

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; queue: QueueSnapshot };

/** "Fever · Viral fever on 12 Aug — Paracetamol 650, Cetirizine" */
function lastVisitText(card: QueueCard) {
  const last = card.lastVisit;
  if (!last) {
    return null;
  }
  const [y, m, d] = last.date.slice(0, 10).split('-').map(Number);
  const date = formatShortDate(new Date(y, m - 1, d));
  const meds = last.medicines.map(x => x.displayName).join(', ');
  return `${last.diagnosis ?? 'Visit'} on ${date}${meds ? ` — ${meds}` : ''}`;
}

/** Doctor home: who is in the room, call next / start / finish, the line. */
export default function DoctorDashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const now = useNow(30 * 1000);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [completing, setCompleting] = useState<QueueCard | null>(null);
  /** Visit ids from "Start consultation" (else looked up when finishing). */
  const visitIds = useRef(new Map<number, number>());
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const fetchQueue = useCallback(async (quiet: boolean) => {
    if (!quiet) {
      setLoad({ status: 'loading' });
    }
    try {
      const queue = await queueApi.getQueue();
      if (mounted.current) {
        setLoad({ status: 'ready', queue });
      }
    } catch (e) {
      if (mounted.current && !quiet) {
        setLoad({
          status: 'error',
          message: userMessage(e, 'Could not load your queue.'),
        });
      }
    }
  }, []);

  useEffect(() => {
    fetchQueue(false);
  }, [fetchQueue]);

  useEffect(
    () => navigation.addListener('focus', () => fetchQueue(true)),
    [navigation, fetchQueue],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      if (appInForeground()) {
        fetchQueue(true);
      }
    }, DOCTOR_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchQueue]);

  const refresh = async () => {
    setRefreshing(true);
    await fetchQueue(true);
    setRefreshing(false);
  };

  /** Runs a queue action; shows the server's error; refetches. */
  const run = async <T extends ApiResult<unknown>>(
    action: () => Promise<T>,
  ): Promise<T | null> => {
    setBusy(true);
    try {
      return await action();
    } catch (e) {
      Alert.alert('Could not update', userMessage(e, 'Please try again.'));
      return null;
    } finally {
      await fetchQueue(true);
      if (mounted.current) {
        setBusy(false);
      }
    }
  };

  const queue = load.status === 'ready' ? load.queue : null;
  const doctorName = queue?.doctor.fullName ?? user?.name ?? 'Doctor';

  const callNext = () =>
    run(async () => {
      const result = await queueApi.callNext();
      if (result.data === null) {
        Alert.alert('No one is waiting', result.message);
      }
      return result;
    });

  const start = (card: QueueCard) =>
    run(async () => {
      const result = await queueApi.startConsultation(card.id);
      visitIds.current.set(card.id, result.data.visitId);
      return result;
    });

  const finish = async (diagnosis: string, callNextToo: boolean) => {
    const card = completing;
    if (!card) {
      return;
    }
    const result = await run(async () => {
      const visitId =
        visitIds.current.get(card.id) ?? (await queueApi.getVisitId(card.id));
      if (visitId == null) {
        throw new Error('No visit for this appointment');
      }
      const completed = await queueApi.completeVisit(visitId, {
        diagnosis,
        callNext: callNextToo,
      });
      return { ...completed, visitId };
    });
    if (result) {
      setCompleting(null);
      const { callNextError } = result.data;
      if (callNextError) {
        Alert.alert('Visit complete', callNextError);
      } else if (!callNextToo) {
        // "Visit completed": the summary, then call the next patient.
        navigation.navigate('VisitDone', { visitId: result.visitId });
      }
    }
  };

  const toggleAvailability = () => {
    if (!queue) {
      return;
    }
    const next =
      queue.doctor.availability.status === 'available'
        ? 'on_break'
        : 'available';
    run(() => queueApi.setAvailability(queue.doctor.id, next));
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Avatar name={doctorName} />
        <View style={styles.flex}>
          <Text style={styles.greeting}>{greetingFor(now)}</Text>
          <Text style={styles.doctorName} numberOfLines={1}>
            {doctorName}
          </Text>
        </View>
        <NotificationBell
          hasUnread={unreadCount > 0}
          onPress={() => comingSoon('Notifications')}
        />
      </View>

      {load.status === 'loading' ? (
        <LoadingView label="Loading your queue…" testID="queue-loading" />
      ) : load.status === 'error' || !queue ? (
        <ErrorView
          message={load.status === 'error' ? load.message : ''}
          onRetry={() => fetchQueue(false)}
          testID="queue-error"
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
          <Dashboard
            queue={queue}
            now={now}
            busy={busy}
            onToggleAvailability={toggleAvailability}
            onCallNext={callNext}
            onRecall={card => run(() => queueApi.recall(card.id))}
            onStart={start}
            onPrescribe={card =>
              navigation.navigate('Prescribe', {
                appointmentId: card.id,
                visitId: visitIds.current.get(card.id),
              })
            }
            onComplete={setCompleting}
            onSeeAll={() => navigation.navigate('Patients')}
          />
        </ScrollView>
      )}

      <CompleteVisitSheet
        patient={completing}
        busy={busy}
        onClose={() => setCompleting(null)}
        onComplete={finish}
      />
    </View>
  );
}

function Dashboard({
  queue,
  now,
  busy,
  onToggleAvailability,
  onCallNext,
  onRecall,
  onStart,
  onPrescribe,
  onComplete,
  onSeeAll,
}: {
  queue: QueueSnapshot;
  now: Date;
  busy: boolean;
  onToggleAvailability: () => void;
  onCallNext: () => void;
  onRecall: (card: QueueCard) => void;
  onStart: (card: QueueCard) => void;
  onPrescribe: (card: QueueCard) => void;
  onComplete: (card: QueueCard) => void;
  onSeeAll: () => void;
}) {
  const { doctor, stats, nowServing: patient, line, late } = queue;
  const available = doctor.availability.status === 'available';
  const room = doctor.opdRoom ?? 'OPD';
  const hours =
    doctor.sessions
      .map(s => `${formatSlotTime(s.startTime)} – ${formatSlotTime(s.endTime)}`)
      .join(', ') || 'No OPD today';
  const progress = stats.total ? stats.seen / stats.total : 0;
  const last = line[line.length - 1];
  const finishBy = last
    ? formatSlotTime(
        (() => {
          const [h, m] = last.estimatedTime.split(':').map(Number);
          const end = h * 60 + m + doctor.consultMinutes;
          return `${Math.floor(end / 60) % 24}:${end % 60}`;
        })(),
      )
    : null;
  const inConsultation = patient?.status === 'in_consultation';
  const history = patient ? lastVisitText(patient) : null;

  return (
    <>
      {/* Session */}
      <View style={styles.sessionRow}>
        <View style={styles.flex}>
          <Text style={styles.sessionDate}>
            {`${formatShortDate(now)} · ${hours}`}
          </Text>
          <Text style={styles.sessionRoom}>
            {[room, doctor.departmentName].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Pressable
          testID="availability-toggle"
          onPress={onToggleAvailability}
          disabled={busy}
          style={[
            styles.statusPill,
            available ? styles.statusAvailable : styles.statusBreak,
          ]}
          accessibilityRole="switch"
          accessibilityState={{ checked: available, disabled: busy }}
        >
          <View
            style={[
              styles.statusDot,
              available ? styles.dotAvailable : styles.dotBreak,
            ]}
          />
          <Text
            style={[
              styles.statusText,
              available ? styles.textAvailable : styles.textBreak,
            ]}
          >
            {available ? 'Available' : doctor.availability.label}
          </Text>
        </Pressable>
      </View>

      {/* Patient in room */}
      <View style={styles.roomCard} testID="room-card">
        <View style={styles.rowBetween}>
          <Text style={styles.roomLabel}>
            {patient && !inConsultation ? 'CALLED IN' : 'IN YOUR ROOM'}
          </Text>
          {inConsultation && patient.startedMinutesAgo != null ? (
            <View style={styles.startedPill}>
              <Text style={styles.startedText}>
                {patient.startedMinutesAgo < 1
                  ? 'Started just now'
                  : `Started ${patient.startedMinutesAgo} min ago`}
              </Text>
            </View>
          ) : null}
        </View>

        {patient ? (
          <>
            <View style={styles.patientRow}>
              <View style={styles.tokenBox}>
                <Text style={styles.tokenLabel}>TOKEN</Text>
                <Text style={styles.tokenValue} testID="room-token">
                  {patient.token?.label ?? '—'}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.patientName} numberOfLines={1}>
                  {patient.patient.fullName}
                </Text>
                <Text style={styles.patientMeta}>
                  {patient.patient.ageGender}
                </Text>
                {patient.reason ? (
                  <View style={styles.complaintRow}>
                    <FileText size={14} color={colors.white} />
                    <Text style={styles.complaintText} numberOfLines={1}>
                      {patient.reason}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {history ? (
              <View style={styles.historyBox}>
                <Text style={styles.historyText}>
                  <Text style={styles.historyLead}>Last visit: </Text>
                  {history}
                </Text>
              </View>
            ) : null}

            <View style={styles.roomActions}>
              {inConsultation ? (
                <>
                  <RoomButton
                    testID="prescribe"
                    label="Prescribe"
                    icon={Pill}
                    kind="ghost"
                    disabled={busy}
                    onPress={() => onPrescribe(patient)}
                  />
                  <RoomButton
                    testID="visit-complete"
                    label="Visit complete"
                    icon={Check}
                    kind="solid"
                    disabled={busy}
                    onPress={() => onComplete(patient)}
                  />
                </>
              ) : (
                <>
                  <RoomButton
                    testID="recall"
                    label="Call again"
                    kind="ghost"
                    disabled={busy}
                    onPress={() => onRecall(patient)}
                  />
                  <RoomButton
                    testID="start-consultation"
                    label="Start"
                    icon={Check}
                    kind="solid"
                    disabled={busy}
                    onPress={() => onStart(patient)}
                  />
                </>
              )}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.roomEmpty}>
              {stats.waiting > 0
                ? `Your room is free. ${stats.waiting} waiting.`
                : 'Your room is free. No patients are waiting.'}
            </Text>
            <RoomButton
              testID="call-next"
              label="Call next patient"
              icon={Volume1}
              kind="solid"
              disabled={busy || stats.waiting === 0 || !available}
              onPress={onCallNext}
            />
            {!available ? (
              <Text style={styles.roomNote}>
                You're on break. Switch to Available to call patients.
              </Text>
            ) : null}
          </>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard
          icon={Calendar}
          tint={colors.primary}
          tintBg={colors.primarySoft}
          label="Today"
          value={stats.total}
          caption="appointments"
        />
        <StatCard
          icon={Clock}
          tint={colors.warning}
          tintBg={colors.warningSoft}
          label="Waiting"
          value={stats.waiting}
          caption="checked in"
        />
      </View>
      <View style={styles.statsRow}>
        <StatCard
          icon={Check}
          tint={colors.success}
          tintBg={colors.successSoft}
          label="Seen"
          value={stats.seen}
          caption={`about ${doctor.consultMinutes} min each`}
        />
        <StatCard
          icon={UserX}
          tint={colors.danger}
          tintBg={colors.dangerSoft}
          label="Not arrived"
          value={stats.notArrived}
          caption={late.length ? `${late.length} late` : 'booked'}
        />
      </View>

      {/* Progress */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>OPD progress</Text>
          <Text style={styles.mutedText}>
            {`${stats.seen} of ${stats.total} seen`}
          </Text>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.trackFill,
              { width: `${Math.min(progress, 1) * 100}%` as const },
            ]}
          />
        </View>
        <Text style={styles.mutedSmall}>
          {finishBy
            ? `Expected to finish by ${finishBy}`
            : 'No one left in the queue'}
        </Text>
      </View>

      {/* Up next */}
      <View style={[styles.rowBetween, styles.sectionHeader]}>
        <Text style={styles.sectionTitle}>Up next</Text>
        <Pressable
          testID="see-all"
          onPress={onSeeAll}
          hitSlop={8}
          accessibilityRole="link"
        >
          <Text style={styles.link}>See all</Text>
        </Pressable>
      </View>
      {line.length === 0 ? (
        <Text style={styles.mutedText}>No patients waiting.</Text>
      ) : (
        line
          .slice(0, UP_NEXT_LIMIT)
          .map(entry => <QueueItem key={entry.id} entry={entry} />)
      )}
    </>
  );
}

function RoomButton({
  testID,
  label,
  icon: Icon,
  kind,
  disabled = false,
  onPress,
}: {
  testID?: string;
  label: string;
  icon?: LucideIcon;
  kind: 'solid' | 'ghost';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      style={({ pressed }) => [
        styles.roomButton,
        kind === 'solid' ? styles.completeButton : styles.pastRxButton,
        (pressed || disabled) && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      {Icon ? (
        <Icon
          size={16}
          color={kind === 'solid' ? colors.navy : colors.white}
          strokeWidth={2.5}
        />
      ) : null}
      <Text style={kind === 'solid' ? styles.completeText : styles.pastRxText}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Diagnosis is required to close the visit (the server finalises the Rx). */
function CompleteVisitSheet({
  patient,
  busy,
  onClose,
  onComplete,
}: {
  patient: QueueCard | null;
  busy: boolean;
  onClose: () => void;
  onComplete: (diagnosis: string, callNext: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [diagnosis, setDiagnosis] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDiagnosis('');
    setError(null);
  }, [patient]);

  const submit = (callNext: boolean) => {
    if (diagnosis.trim().length < 2) {
      setError('Enter a diagnosis.');
      return;
    }
    onComplete(diagnosis.trim(), callNext);
  };

  return (
    <Modal
      visible={patient !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.sheetBackdrop}>
        <Pressable style={styles.flex} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.sheetTitle}>
            {patient
              ? `Finish visit · ${patient.token?.label ?? ''} ${
                  patient.patient.fullName
                }`
              : ''}
          </Text>
          <Text style={styles.mutedSmall}>
            The patient gets an SMS when the visit is closed.
          </Text>
          <TextInput
            testID="diagnosis-input"
            value={diagnosis}
            onChangeText={text => {
              setDiagnosis(text);
              setError(null);
            }}
            placeholder="Diagnosis, e.g. Viral fever"
            placeholderTextColor={colors.placeholder}
            style={[styles.sheetInput, error && styles.sheetInputError]}
            autoFocus
          />
          {error ? (
            <Text style={styles.sheetError} testID="diagnosis-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.sheetButtons}>
            <Pressable
              testID="complete-only"
              disabled={busy}
              onPress={() => submit(false)}
              style={({ pressed }) => [
                styles.sheetButton,
                styles.sheetButtonOutline,
                (pressed || busy) && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.sheetButtonOutlineText}>Complete</Text>
            </Pressable>
            <Pressable
              testID="complete-call-next"
              disabled={busy}
              onPress={() => submit(true)}
              style={({ pressed }) => [
                styles.sheetButton,
                styles.sheetButtonSolid,
                (pressed || busy) && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.sheetButtonSolidText}>
                  Complete & call next
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StatCard({
  icon: Icon,
  tint,
  tintBg,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  tint: string;
  tintBg: string;
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <View style={[styles.card, styles.statCard]}>
      <View style={styles.statHeader}>
        <View style={[styles.statIcon, { backgroundColor: tintBg }]}>
          <Icon size={16} color={tint} strokeWidth={2.2} />
        </View>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.mutedSmall} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

type BadgeKind = 'next' | 'waiting' | 'not_arrived';

const BADGES: Record<BadgeKind, { label: string; bg: string; fg: string }> = {
  next: { label: 'Next', bg: colors.successSoft, fg: colors.successText },
  waiting: { label: 'Waiting', bg: colors.warningSoft, fg: colors.warningText },
  not_arrived: {
    label: 'Not arrived',
    bg: colors.neutralSoft,
    fg: colors.neutralText,
  },
};

function QueueItem({ entry }: { entry: queueApi.QueueLineEntry }) {
  const kind: BadgeKind = !entry.arrived
    ? 'not_arrived'
    : entry.position === 1
    ? 'next'
    : 'waiting';
  const badge = BADGES[kind];

  return (
    <View style={styles.queueItem} testID={`up-next-${entry.id}`}>
      <View style={styles.queueToken}>
        <Text style={styles.queueTokenText}>{entry.token?.label ?? '—'}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.queueName} numberOfLines={1}>
          {entry.patient.fullName}
        </Text>
        <Text style={styles.mutedSmall} numberOfLines={1}>
          {[
            entry.patient.ageGender,
            `est. ${entry.estimatedTimeLabel}`,
            entry.reason,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <View style={[styles.badge, { backgroundColor: badge.bg }]}>
        <Text style={[styles.badgeText, { color: badge.fg }]}>
          {badge.label}
        </Text>
      </View>
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
  },
  pressed: { opacity: 0.8 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  greeting: { fontSize: 13, color: colors.muted },
  doctorName: { fontSize: 18, fontWeight: '700', color: colors.navy },

  content: { padding: 16, gap: 12, paddingBottom: 24 },

  // Session
  sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionDate: { fontSize: 13, color: colors.muted },
  sessionRoom: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusAvailable: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successBorder,
  },
  statusBreak: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningBorder,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotAvailable: { backgroundColor: colors.success },
  dotBreak: { backgroundColor: colors.warning },
  statusText: { fontSize: 13, fontWeight: '700' },
  textAvailable: { color: colors.successText },
  textBreak: { color: colors.warningText },

  // Room card
  roomCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 16,
    gap: 14,
  },
  roomLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.85)',
  },
  startedPill: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  startedText: { fontSize: 12, fontWeight: '600', color: colors.white },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tokenBox: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 64,
  },
  tokenLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.primary,
  },
  tokenValue: { fontSize: 20, fontWeight: '800', color: colors.navy },
  patientName: { fontSize: 18, fontWeight: '700', color: colors.white },
  patientMeta: { marginTop: 2, fontSize: 13, color: colors.white },
  complaintRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  complaintText: { flexShrink: 1, fontSize: 13, color: colors.white },
  historyBox: {
    backgroundColor: colors.noteSoft,
    borderRadius: 12,
    padding: 12,
  },
  historyText: { fontSize: 13, lineHeight: 19, color: colors.noteText },
  historyLead: { fontWeight: '700' },
  roomActions: { flexDirection: 'row', gap: 10 },
  roomButton: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pastRxButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  pastRxText: { fontSize: 15, fontWeight: '700', color: colors.white },
  completeButton: { backgroundColor: colors.white },
  completeText: { fontSize: 15, fontWeight: '700', color: colors.navy },
  roomEmpty: { fontSize: 15, color: colors.white },

  // Cards & stats
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1 },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 14, color: colors.text },
  statValue: {
    marginTop: 10,
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  mutedText: { fontSize: 14, color: colors.muted },
  mutedSmall: { fontSize: 13, color: colors.muted },

  // Progress
  track: {
    marginTop: 12,
    marginBottom: 10,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.neutralSoft,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },

  // Up next
  sectionHeader: { marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  queueToken: {
    backgroundColor: colors.primarySoft,
    borderRadius: 10,
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTokenText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  queueName: { fontSize: 15, fontWeight: '700', color: colors.text },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  roomNote: { fontSize: 13, color: colors.white, opacity: 0.9 },

  // Finish visit sheet
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 18,
    paddingHorizontal: 16,
    gap: 10,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.navy },
  sheetInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
  },
  sheetInputError: { borderColor: colors.error },
  sheetError: { fontSize: 13, color: colors.error },
  sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sheetButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetButtonOutline: { borderWidth: 1.5, borderColor: colors.primary },
  sheetButtonOutlineText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  sheetButtonSolid: { backgroundColor: colors.primary },
  sheetButtonSolidText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
});
