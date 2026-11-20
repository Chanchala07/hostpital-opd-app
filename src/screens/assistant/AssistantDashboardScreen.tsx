import React, { useState } from 'react';
import {
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
import { Volume1 } from 'lucide-react-native';
import { useAuth } from '../../auth/AuthContext';
import Avatar from '../../components/Avatar';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import NotificationBell from '../../components/NotificationBell';
import { useNotifications } from '../../notifications/NotificationsContext';
import type {
  AssistantTabParamList,
  RootStackParamList,
} from '../../navigation/types';
import { avatarPalette, colors } from '../../theme/colors';
import { comingSoon, formatShortDate, greetingFor } from '../../utils/format';
import { useAssistantDesk } from './AssistantDeskContext';
import {
  shortDoctorName,
  tokensToday,
  type DeskPatient,
  type DoctorQueue,
} from './deskModel';
import LateArrivalSheet from './LateArrivalSheet';

type Props = CompositeScreenProps<
  BottomTabScreenProps<AssistantTabParamList, 'Desk'>,
  NativeStackScreenProps<RootStackParamList>
>;

const WAITING_PREVIEW_LIMIT = 5;

const sum = (doctors: DoctorQueue[], pick: (d: DoctorQueue) => number) =>
  doctors.reduce((total, d) => total + pick(d), 0);

export default function AssistantDashboardScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { load, desk, lastAnnouncement, busy, refreshing, refresh, actions } =
    useAssistantDesk();
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [latePatient, setLatePatient] = useState<DeskPatient | null>(null);

  const now = new Date();
  const name = user?.name ?? 'Assistant';
  const firstName = name.split(/\s+/)[0];
  const doctor = desk.doctors.find(d => d.id === selectedId) ?? desk.doctors[0];
  const anyDoctorLate = desk.doctors.some(
    d => d.availability.status === 'late',
  );

  return (
    <View style={styles.screen}>
      {/* Header + stats */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable
            testID="open-profile"
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <Avatar
              name={name}
              background={colors.successSoft}
              color={colors.successText}
            />
          </Pressable>
          <View style={styles.flex}>
            <Text style={styles.greeting} numberOfLines={1}>
              {`${greetingFor(now)}, ${firstName}`}
            </Text>
            <Text style={styles.mutedSmall} numberOfLines={1}>
              {[formatShortDate(now), desk.deskName]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <NotificationBell
            hasUnread={unreadCount > 0}
            onPress={() => comingSoon('Notifications')}
          />
        </View>

        <View style={styles.statsRow}>
          <StatTile
            label="Today"
            value={sum(desk.doctors, tokensToday)}
            bg={colors.primarySoft}
            fg={colors.navy}
          />
          <StatTile
            label="Waiting"
            value={sum(desk.doctors, d => d.waiting.length)}
            bg={colors.warningSoft}
            fg={colors.warningText}
          />
          <StatTile
            label="Not arrived"
            value={sum(desk.doctors, d => d.notArrived.length)}
            bg={colors.neutralSoft}
            fg={colors.neutralText}
          />
          <StatTile
            label="Seen"
            value={sum(desk.doctors, d => d.done.length)}
            bg={colors.successSoft}
            fg={colors.successText}
          />
        </View>
      </View>

      {load.status === 'loading' ? (
        <LoadingView label="Loading the queue…" testID="desk-loading" />
      ) : load.status === 'error' ? (
        <ErrorView
          message={load.message}
          onRetry={refresh}
          testID="desk-error"
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
          {/* Last announcement */}
          {lastAnnouncement ? (
            <View
              testID="announcement"
              style={styles.banner}
              accessibilityLiveRegion="polite"
            >
              <Volume1 size={18} color={colors.primary} />
              <Text style={styles.bannerText}>{lastAnnouncement}</Text>
            </View>
          ) : null}

          {doctor ? (
            <>
              <QueueControl
                doctors={desk.doctors}
                doctor={doctor}
                busy={busy}
                onSelectDoctor={setSelectedId}
                onCallNext={() => actions.callNext(doctor.id)}
                onRecall={() =>
                  doctor.nowServing &&
                  actions.recall(doctor.id, doctor.nowServing.appointmentId)
                }
                onSkipNext={() =>
                  doctor.waiting[0] &&
                  actions.skip(doctor.id, doctor.waiting[0].appointmentId)
                }
              />

              {/* Late: booked, not here after slot + grace */}
              {doctor.late.length > 0 ? (
                <View testID="late-card" style={[styles.card, styles.lateCard]}>
                  <Text style={styles.lateTitle}>
                    {`Late · not here ${doctor.rules.lateGraceMinutes} min after their slot`}
                  </Text>
                  <Text style={styles.mutedSmall}>
                    The queue moves them to the next free slot and tells them
                    the new time. Tap Arrived when they reach the desk.
                  </Text>
                  {doctor.late.map(p => (
                    <View key={p.appointmentId} style={styles.lateRow}>
                      <View style={styles.tokenChip}>
                        <Text style={styles.tokenChipText}>{p.token}</Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.itemName} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.mutedSmall} numberOfLines={1}>
                          {`${p.time} slot · ${p.lateMinutes} min late`}
                        </Text>
                      </View>
                      <Pressable
                        testID={`arrived-${p.token}`}
                        disabled={busy}
                        style={({ pressed }) => [
                          styles.smallButton,
                          styles.lateButton,
                          (pressed || busy) && styles.pressed,
                        ]}
                        onPress={() => setLatePatient(p)}
                        accessibilityRole="button"
                        accessibilityLabel={`${p.token}, ${p.name} arrived late`}
                      >
                        <Text style={styles.lateButtonText}>Arrived</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Waiting list for the selected doctor */}
              <View style={[styles.rowBetween, styles.sectionHeader]}>
                <Text style={styles.sectionTitle}>
                  {`Waiting · ${shortDoctorName(doctor.name)}`}
                </Text>
                <Pressable
                  onPress={() => navigation.navigate('Tokens')}
                  hitSlop={8}
                  accessibilityRole="link"
                >
                  <Text style={styles.link}>All tokens</Text>
                </Pressable>
              </View>
              {doctor.waiting.length === 0 ? (
                <Text style={styles.mutedText}>No patients waiting.</Text>
              ) : (
                doctor.waiting.slice(0, WAITING_PREVIEW_LIMIT).map(p => (
                  <View key={p.token} style={[styles.card, styles.listItem]}>
                    <View style={styles.tokenChip}>
                      <Text style={styles.tokenChipText}>{p.token}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.mutedSmall} numberOfLines={1}>
                        {[p.ageGender, p.complaint].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <Pressable
                      testID={`call-${p.token}`}
                      disabled={busy}
                      style={({ pressed }) => [
                        styles.smallButton,
                        (pressed || busy) && styles.pressed,
                      ]}
                      onPress={() =>
                        actions.callPatient(doctor.id, p.appointmentId)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Call ${p.token}, ${p.name}`}
                    >
                      <Text style={styles.smallButtonText}>Call</Text>
                    </Pressable>
                  </View>
                ))
              )}
            </>
          ) : null}

          {/* Doctors on duty */}
          <View style={[styles.card, styles.dutyCard]}>
            <Text style={styles.sectionTitle}>Doctors on duty</Text>
            {desk.doctors.map((d, i) => {
              const avatar = avatarPalette[i % avatarPalette.length];
              const late = d.availability.status !== 'available';
              return (
                <View key={d.id} style={styles.dutyRow}>
                  <Avatar
                    name={d.name}
                    size={40}
                    background={avatar.bg}
                    color={avatar.fg}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {d.name}
                    </Text>
                    <Text style={styles.mutedSmall}>{d.room}</Text>
                  </View>
                  <View
                    style={[
                      styles.badge,
                      late ? styles.badgeLate : styles.badgeIn,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        late ? styles.badgeLateText : styles.badgeInText,
                      ]}
                    >
                      {d.availability.label}
                    </Text>
                  </View>
                </View>
              );
            })}
            {anyDoctorLate ? (
              <Pressable
                style={({ pressed }) => [
                  styles.outlineButton,
                  styles.notifyButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => comingSoon('Delay notification')}
                accessibilityRole="button"
              >
                <Text style={styles.outlineText}>
                  Notify waiting patients of delay
                </Text>
              </Pressable>
            ) : null}
            {desk.doctors.length === 0 ? (
              <Text style={styles.mutedText}>
                No doctors are assigned to you yet.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      )}

      {doctor ? (
        <LateArrivalSheet
          patient={latePatient}
          clinicRule={doctor.rules.lateArrivalRule}
          onClose={() => setLatePatient(null)}
          onPick={choice => {
            const id = latePatient?.appointmentId;
            if (id == null) {
              return;
            }
            if (choice === 'no_show') {
              actions.noShow(doctor.id, id);
            } else {
              actions.reinsert(doctor.id, id, choice);
            }
          }}
        />
      ) : null}
    </View>
  );
}

function StatTile({
  label,
  value,
  bg,
  fg,
}: {
  label: string;
  value: number;
  bg: string;
  fg: string;
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: bg }]}>
      <Text style={[styles.statValue, { color: fg }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function QueueControl({
  doctors,
  doctor,
  busy,
  onSelectDoctor,
  onCallNext,
  onRecall,
  onSkipNext,
}: {
  doctors: DoctorQueue[];
  doctor: DoctorQueue;
  busy: boolean;
  onSelectDoctor: (id: number) => void;
  onCallNext: () => void;
  onRecall: () => void;
  onSkipNext: () => void;
}) {
  const serving = doctor.nowServing;
  const upNext = doctor.waiting[0];
  const canCall = !!upNext && !busy;
  const canRecall = !!serving && !busy;
  const canSkip = doctor.waiting.length > 1 && !busy;

  return (
    <View style={styles.queueCard}>
      {/* Doctor switcher */}
      <View style={styles.doctorTabs}>
        {doctors.map(d => {
          const selected = d.id === doctor.id;
          return (
            <Pressable
              key={d.id}
              testID={`doctor-tab-${d.id}`}
              style={[styles.doctorTab, selected && styles.doctorTabSelected]}
              onPress={() => onSelectDoctor(d.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Text
                style={[
                  styles.doctorTabName,
                  selected && styles.doctorTabTextSelected,
                ]}
                numberOfLines={1}
              >
                {d.name}
              </Text>
              <Text
                style={[
                  styles.doctorTabMeta,
                  selected && styles.doctorTabTextSelected,
                ]}
                numberOfLines={1}
              >
                {`${d.room} · ${d.waiting.length} waiting`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Now serving */}
      <View style={styles.servingBand}>
        {serving ? (
          <>
            <View>
              <Text style={styles.servingLabel}>NOW SERVING</Text>
              <Text style={styles.servingToken}>{serving.token}</Text>
            </View>
            <View style={styles.servingDivider} />
            <View style={styles.flex}>
              <Text style={styles.servingName} numberOfLines={1}>
                {serving.name}
              </Text>
              <Text style={styles.servingMeta} numberOfLines={1}>
                {[serving.ageGender, serving.complaint]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text style={styles.servingMeta} numberOfLines={1}>
                {`${doctor.room} · ${doctor.name}`}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.flex}>
            <Text style={styles.servingLabel}>NOW SERVING</Text>
            <Text style={styles.servingName}>No patient in the room</Text>
            <Text style={styles.servingMeta}>
              {doctor.availability.status === 'available'
                ? `${doctor.room} · ${doctor.name}`
                : `${doctor.name} · ${doctor.availability.label}`}
            </Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={styles.queueControls}>
        <View style={styles.rowBetween}>
          <Text style={styles.mutedText}>Up next</Text>
          <Text style={styles.upNextText} numberOfLines={1}>
            {upNext ? (
              <>
                <Text style={styles.upNextToken}>{upNext.token}</Text>
                {` · ${upNext.name}`}
              </>
            ) : (
              'No one waiting'
            )}
          </Text>
        </View>

        <Pressable
          testID="call-next"
          disabled={!canCall}
          style={({ pressed }) => [
            styles.primaryButton,
            (pressed || !canCall) && styles.pressed,
            !canCall && styles.disabled,
          ]}
          onPress={onCallNext}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCall }}
        >
          <Volume1 size={20} color={colors.white} />
          <Text style={styles.primaryButtonText}>Call next patient</Text>
        </Pressable>

        <View style={styles.buttonRow}>
          <Pressable
            testID="recall"
            disabled={!canRecall}
            style={({ pressed }) => [
              styles.outlineButton,
              pressed && styles.pressed,
              !canRecall && styles.disabled,
            ]}
            onPress={onRecall}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canRecall }}
          >
            <Text style={styles.outlineText}>Recall</Text>
          </Pressable>
          <Pressable
            testID="skip-next"
            disabled={!canSkip}
            style={({ pressed }) => [
              styles.outlineButton,
              styles.dangerOutline,
              pressed && styles.pressed,
              !canSkip && styles.disabled,
            ]}
            onPress={onSkipNext}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSkip }}
          >
            <Text style={styles.dangerText}>Skip next</Text>
          </Pressable>
        </View>
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
    gap: 12,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.45 },

  // Header
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  greeting: { fontSize: 18, fontWeight: '700', color: colors.navy },
  statsRow: { flexDirection: 'row', gap: 8 },
  statTile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { marginTop: 2, fontSize: 11, color: colors.muted },

  content: { padding: 16, gap: 12, paddingBottom: 32 },

  // Announcement
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerText: { flex: 1, fontSize: 14, color: colors.chipText },

  // Queue control
  queueCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: RADIUS,
    overflow: 'hidden',
  },
  doctorTabs: { flexDirection: 'row', gap: 8, padding: 10 },
  doctorTab: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  doctorTabSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  doctorTabName: { fontSize: 14, fontWeight: '600', color: colors.text },
  doctorTabMeta: { marginTop: 1, fontSize: 12, color: colors.muted },
  doctorTabTextSelected: { color: colors.primary },
  servingBand: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  servingLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.85)',
  },
  servingToken: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 46,
  },
  servingDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  servingName: { fontSize: 17, fontWeight: '700', color: colors.white },
  servingMeta: { marginTop: 2, fontSize: 13, color: colors.white },
  queueControls: { padding: 14, gap: 12 },
  upNextText: { flexShrink: 1, fontSize: 14, color: colors.text },
  upNextToken: { fontWeight: '700' },
  primaryButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: { fontSize: 16, fontWeight: '700', color: colors.white },
  buttonRow: { flexDirection: 'row', gap: 10 },
  outlineButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: { fontSize: 15, fontWeight: '500', color: colors.text },
  dangerOutline: { borderColor: colors.alertBorder },
  dangerText: { fontSize: 15, fontWeight: '500', color: colors.error },

  // Lists & sections
  sectionHeader: { marginTop: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.navy },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tokenChip: {
    width: 52,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenChipText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  itemName: { fontSize: 15, fontWeight: '700', color: colors.text },
  mutedText: { fontSize: 14, color: colors.muted },
  mutedSmall: { fontSize: 13, color: colors.muted },
  smallButton: {
    backgroundColor: colors.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  smallButtonText: { fontSize: 14, fontWeight: '700', color: colors.primary },

  // Late patients
  lateCard: { gap: 10, borderColor: colors.danger },
  lateTitle: { fontSize: 15, fontWeight: '700', color: colors.danger },
  lateRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lateButton: { backgroundColor: colors.dangerSoft },
  lateButtonText: { fontSize: 14, fontWeight: '700', color: colors.danger },

  // Doctors on duty
  dutyCard: { padding: 16, gap: 14 },
  dutyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeIn: { backgroundColor: colors.successSoft },
  badgeLate: { backgroundColor: colors.warningSoft },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeInText: { color: colors.successText },
  badgeLateText: { color: colors.warningText },
  notifyButton: { flex: 0, marginTop: 2 },
});
