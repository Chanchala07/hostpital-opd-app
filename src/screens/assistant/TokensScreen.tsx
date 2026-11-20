import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import {
  FilterChips,
  SearchBox,
  SegmentedTabs,
  Tag,
} from '../../components/ListControls';
import { colors } from '../../theme/colors';
import { useAssistantDesk } from './AssistantDeskContext';
import {
  LATE_RULE_LABELS,
  shortDoctorName,
  tokensToday,
  type DeskPatient,
  type DoctorQueue,
} from './deskModel';
import LateArrivalSheet from './LateArrivalSheet';

type TokenStatus = 'done' | 'in_room' | 'checked_in' | 'not_arrived' | 'late';
type TokenRow = DeskPatient & { status: TokenStatus };

type FilterKey = 'all' | 'queue' | 'not_arrived' | 'late' | 'done';

const FILTERS: {
  key: FilterKey;
  label: string;
  match: (t: TokenRow) => boolean;
}[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'queue',
    label: 'In queue',
    match: t => t.status === 'in_room' || t.status === 'checked_in',
  },
  {
    key: 'not_arrived',
    label: 'Not arrived',
    match: t => t.status === 'not_arrived',
  },
  { key: 'late', label: 'Late', match: t => t.status === 'late' },
  { key: 'done', label: 'Done', match: t => t.status === 'done' },
];

/** Every token the doctor has today, in queue order (done last). */
function tokensOf(doctor: DoctorQueue): TokenRow[] {
  return [
    ...(doctor.nowServing
      ? [{ ...doctor.nowServing, status: 'in_room' as const }]
      : []),
    ...doctor.waiting.map(p => ({ ...p, status: 'checked_in' as const })),
    ...doctor.notArrived.map(p => ({ ...p, status: 'not_arrived' as const })),
    ...doctor.late.map(p => ({ ...p, status: 'late' as const })),
    ...doctor.done.map(p => ({ ...p, status: 'done' as const })),
  ];
}

type Props = { onBack: () => void };

/** Assistant: every token for one doctor today, with check-in / call / late arrivals. */
export default function TokensScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { load, desk, busy, refreshing, refresh, actions } = useAssistantDesk();
  const [doctorId, setDoctorId] = useState<number | undefined>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [latePatient, setLatePatient] = useState<DeskPatient | null>(null);

  const doctor = desk.doctors.find(d => d.id === doctorId) ?? desk.doctors[0];
  const tokens = useMemo(() => (doctor ? tokensOf(doctor) : []), [doctor]);
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? tokens.filter(
          t =>
            t.name.toLowerCase().includes(q) ||
            t.token.toLowerCase().includes(q),
        )
      : tokens;
  }, [tokens, query]);
  const activeFilter = FILTERS.find(f => f.key === filter) ?? FILTERS[0];
  const visible = searched.filter(activeFilter.match);

  const header = (subtitle: string | null) => (
    <View style={styles.titleRow}>
      <Pressable
        testID="back"
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ArrowLeft size={22} color={colors.text} />
      </Pressable>
      <View style={styles.flex}>
        <Text style={styles.title}>Today's tokens</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  if (load.status !== 'ready' || !doctor) {
    return (
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          {header(null)}
        </View>
        {load.status === 'loading' ? (
          <LoadingView label="Loading the queue…" testID="tokens-loading" />
        ) : load.status === 'error' ? (
          <ErrorView
            message={load.message}
            onRetry={refresh}
            testID="tokens-error"
          />
        ) : (
          <Text style={styles.empty}>No doctors are assigned to you yet.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header, doctor switch, search and filters */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {header(
          `${doctor.room} · ${tokensToday(doctor)} tokens · ${
            doctor.waiting.length
          } waiting`,
        )}

        {desk.doctors.length > 1 ? (
          <SegmentedTabs
            testIDPrefix="doctor-tab"
            options={desk.doctors.map(d => ({
              key: d.id,
              label: shortDoctorName(d.name),
            }))}
            value={doctor.id}
            onChange={setDoctorId}
          />
        ) : null}

        <SearchBox
          testID="token-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or token"
        />

        <FilterChips
          options={FILTERS.map(f => ({
            key: f.key,
            label: f.label,
            count: searched.filter(f.match).length,
          }))}
          value={filter}
          onChange={setFilter}
        />
        <Text style={styles.rules} testID="queue-rules">
          {`Late after ${
            doctor.rules.lateGraceMinutes
          } min · late arrivals go to: ${
            LATE_RULE_LABELS[doctor.rules.lateArrivalRule]
          }`}
        </Text>
      </View>

      <FlatList
        data={visible}
        keyExtractor={t => String(t.appointmentId)}
        renderItem={({ item }) => (
          <TokenCard
            row={item}
            disabled={busy}
            onCall={() => actions.callPatient(doctor.id, item.appointmentId)}
            onCheckIn={() => actions.checkIn(doctor.id, item.appointmentId)}
            onArrivedLate={() => setLatePatient(item)}
          />
        )}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query.trim()
              ? `No tokens match "${query.trim()}".`
              : 'No tokens here.'}
          </Text>
        }
      />

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
    </View>
  );
}

function TokenCard({
  row,
  disabled,
  onCall,
  onCheckIn,
  onArrivedLate,
}: {
  row: TokenRow;
  disabled: boolean;
  onCall: () => void;
  onCheckIn: () => void;
  onArrivedLate: () => void;
}) {
  const done = row.status === 'done';
  const inRoom = row.status === 'in_room';
  const late = row.status === 'late';
  const timeText = late
    ? `${row.time} · ${row.lateMinutes} min late`
    : row.eta && row.eta !== row.time
    ? `${row.time} · est. ${row.eta}`
    : row.time;

  return (
    <View
      testID={`token-${row.token}`}
      style={[
        styles.card,
        done && styles.cardDone,
        inRoom && styles.cardInRoom,
        late && styles.cardLate,
      ]}
    >
      <View style={[styles.badge, inRoom && styles.badgeInRoom]}>
        <Text style={[styles.badgeText, inRoom && styles.badgeTextInRoom]}>
          {row.token}
        </Text>
      </View>

      <View style={styles.flex}>
        <Text style={[styles.name, done && styles.nameDone]} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[row.ageGender, row.complaint].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.tagRow}>
          <Text style={styles.time}>{timeText}</Text>
          {row.source === 'online' ? (
            <Tag text="Online" bg={colors.tealSoft} fg={colors.tealText} />
          ) : (
            <Tag text="Walk-in" bg={colors.purpleSoft} fg={colors.purple} />
          )}
          <StatusTag status={row.status} />
          {row.movedFrom && !done ? (
            <Tag
              text={`Moved from ${row.movedFrom}`}
              bg={colors.warningSoft}
              fg={colors.warningText}
            />
          ) : null}
        </View>
      </View>

      {done ? null : inRoom ? (
        <Text style={styles.inRoom}>In room</Text>
      ) : row.status === 'checked_in' ? (
        <ActionButton
          testID={`call-${row.token}`}
          label="Call"
          kind="primary"
          disabled={disabled}
          onPress={onCall}
          a11y={`Call ${row.token} ${row.name}`}
        />
      ) : late ? (
        <ActionButton
          testID={`arrived-${row.token}`}
          label="Arrived"
          kind="warning"
          disabled={disabled}
          onPress={onArrivedLate}
          a11y={`${row.token} ${row.name} arrived late`}
        />
      ) : (
        <ActionButton
          testID={`check-in-${row.token}`}
          label="Check in"
          kind="outline"
          disabled={disabled}
          onPress={onCheckIn}
          a11y={`Check in ${row.token} ${row.name}`}
        />
      )}
    </View>
  );
}

function ActionButton({
  testID,
  label,
  kind,
  disabled,
  onPress,
  a11y,
}: {
  testID: string;
  label: string;
  kind: 'primary' | 'outline' | 'warning';
  disabled: boolean;
  onPress: () => void;
  a11y: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        kind === 'primary' && styles.callButton,
        kind === 'outline' && styles.checkInButton,
        kind === 'warning' && styles.lateButton,
        (pressed || disabled) && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
    >
      <Text
        style={[
          styles.actionText,
          kind === 'primary' && styles.callText,
          kind === 'outline' && styles.checkInText,
          kind === 'warning' && styles.lateText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatusTag({ status }: { status: TokenStatus }) {
  switch (status) {
    case 'done':
      return (
        <Tag
          text="Completed"
          bg={colors.surface}
          fg={colors.muted}
          border={colors.border}
        />
      );
    case 'in_room':
      return (
        <Tag
          text="In consultation"
          bg={colors.successSoft}
          fg={colors.successText}
        />
      );
    case 'checked_in':
      return (
        <Tag
          text="Checked in"
          bg={colors.warningSoft}
          fg={colors.warningText}
        />
      );
    case 'not_arrived':
      return (
        <Tag
          text="Not arrived"
          bg={colors.neutralSoft}
          fg={colors.neutralText}
        />
      );
    case 'late':
      return <Tag text="Late" bg={colors.dangerSoft} fg={colors.danger} />;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },

  // Header
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.navy },
  subtitle: { marginTop: 1, fontSize: 13, color: colors.muted },
  rules: { fontSize: 12, color: colors.muted },

  // List
  list: { padding: 16, gap: 12, paddingBottom: 24 },
  empty: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 14,
    color: colors.muted,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  cardDone: { opacity: 0.7 },
  cardInRoom: {
    backgroundColor: colors.successFaint,
    borderColor: colors.success,
  },
  cardLate: { borderColor: colors.danger },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInRoom: { backgroundColor: colors.success },
  badgeText: { fontSize: 15, fontWeight: '800', color: colors.primary },
  badgeTextInRoom: { color: colors.white },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  nameDone: { color: colors.neutralText },
  meta: { marginTop: 1, fontSize: 13, color: colors.muted },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  time: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginRight: 2,
  },
  inRoom: { fontSize: 14, fontWeight: '700', color: colors.successText },
  actionButton: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 15, fontWeight: '700' },
  callButton: { backgroundColor: colors.primary, paddingHorizontal: 18 },
  callText: { color: colors.white },
  checkInButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  checkInText: { fontWeight: '600', color: colors.primary },
  lateButton: { backgroundColor: colors.danger },
  lateText: { color: colors.white },
});
