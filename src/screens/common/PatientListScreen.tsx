import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  // Hidden for now: the card actions and the + (add patient) button below.
  // History,
  // List,
  // PenLine,
  // Plus,
  // Printer,
  // type LucideIcon,
} from 'lucide-react-native';
import { getMyDoctors, type MyDoctors } from '../../api/myDoctors';
import { searchPatients, type RegisteredPatient } from '../../api/patients';
import { checkIn, getQueue } from '../../api/queue';
import Avatar from '../../components/Avatar';
import { FilterChips, SearchBox, Tag } from '../../components/ListControls';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import { avatarPalette, colors } from '../../theme/colors';
import { appInForeground } from '../../utils/appState';
import { userMessage } from '../../utils/errors';
// import { comingSoon } from '../../utils/format'; // card actions, hidden for now
import { shortDoctorName } from '../assistant/deskModel';
import {
  formatIsoDate,
  matchesQuery,
  sortPatients,
  toTodayPatients,
  type PatientStatus,
  type TodayPatient,
} from './patientListModel';

export type PatientListViewer = 'doctor' | 'assistant';

/** How often the list refreshes while the app is open. */
export const PATIENT_LIST_POLL_MS = 30 * 1000;
/** Pause after typing before searching every registered patient. */
export const REGISTRY_SEARCH_DELAY_MS = 350;
const REGISTRY_MIN_CHARS = 2;

type Props = {
  /** Doctors see their own patients; assistants see their doctors'. */
  viewer: PatientListViewer;
  /** Shown in the subtitle, e.g. "Desk 1". Defaults to the doctor's room. */
  place?: string;
  onBack: () => void;
  /**
   * Opens "Add new patient". Not used for now: the + button is commented out
   * below; un-comment it to bring it back.
   */
  onAddPatient?: () => void;
  /** Subscribes to the screen gaining focus (e.g. back from Add patient). */
  onFocus?: (callback: () => void) => () => void;
};

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; patients: TodayPatient[]; room: string | null };

/** "Other registered patients" while searching. */
type Registry =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: RegisteredPatient[] };

type FilterKey = 'all' | 'queue' | 'not_arrived' | 'seen';

const FILTERS: {
  key: FilterKey;
  label: string;
  match: (p: TodayPatient) => boolean;
}[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'queue',
    label: 'In queue',
    match: p => p.status === 'in_room' || p.status === 'waiting',
  },
  {
    key: 'not_arrived',
    label: 'Not arrived',
    match: p => p.status === 'not_arrived',
  },
  { key: 'seen', label: 'Seen', match: p => p.status === 'seen' },
];

// Card actions, hidden for now (also un-comment the action row in PatientCard
// and the icon / comingSoon imports above).
// const ACTIONS: {
//   key: string;
//   label: string;
//   feature: string;
//   icon: LucideIcon;
//   highlight?: boolean;
// }[] = [
//   {
//     key: 'edit',
//     label: 'Edit details',
//     feature: 'Edit details',
//     icon: PenLine,
//   },
//   {
//     key: 'rx-list',
//     label: 'Rx list',
//     feature: 'Prescription list',
//     icon: List,
//   },
//   {
//     key: 'last-rx',
//     label: 'Last Rx',
//     feature: 'Print last prescription',
//     icon: Printer,
//     highlight: true,
//   },
//   { key: 'history', label: 'History', feature: 'Visit history', icon: History },
// ];

/** Same person → same colour, so avatars don't shuffle as the list changes. */
function avatarColorsFor(name: string, seen = false) {
  if (seen) {
    return { bg: colors.neutralSoft, fg: colors.neutralText };
  }
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return avatarPalette[hash % avatarPalette.length];
}

/**
 * Today's patients, live from each doctor's queue (GET /queue). Searching
 * also looks through every registered patient (GET /patients?search=).
 */
export default function PatientListScreen({
  viewer,
  place,
  onBack,
  // onAddPatient, // + button hidden for now
  onFocus,
}: Props) {
  const insets = useSafeAreaInsets();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [registry, setRegistry] = useState<Registry>({ status: 'idle' });
  /** The patient being checked in (one at a time). */
  const [checkingIn, setCheckingIn] = useState<number | null>(null);
  const mine = useRef<MyDoctors | null>(null);
  const mounted = useRef(true);
  /** Only the newest request may update the screen. */
  const latest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchPatients = useCallback(async (quiet: boolean) => {
    const request = ++latest.current;
    if (!quiet) {
      setLoad({ status: 'loading' });
    }
    try {
      if (!mine.current) {
        mine.current = await getMyDoctors();
      }
      const { doctors, self } = mine.current;
      // A doctor asks for "mine"; the desk names each doctor.
      const queues = await Promise.all(
        doctors.map(d => getQueue(self ? undefined : d.id)),
      );
      if (!mounted.current || request !== latest.current) {
        return;
      }
      setLoad({
        status: 'ready',
        patients: sortPatients(queues.flatMap(toTodayPatients)),
        room: self ? queues[0]?.doctor.opdRoom ?? doctors[0]?.room : null,
      });
    } catch (e) {
      // A failed background refresh keeps what is shown.
      if (mounted.current && request === latest.current && !quiet) {
        setLoad({
          status: 'error',
          message: userMessage(e, 'Could not load today’s patients.'),
        });
      }
    }
  }, []);

  const refresh = useCallback(() => fetchPatients(true), [fetchPatients]);

  useEffect(() => {
    fetchPatients(false);
  }, [fetchPatients]);

  useEffect(() => onFocus?.(refresh), [onFocus, refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (appInForeground()) {
        refresh();
      }
    }, PATIENT_LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const pullToRefresh = async () => {
    setRefreshing(true);
    await fetchPatients(true);
    if (mounted.current) {
      setRefreshing(false);
    }
  };

  /**
   * Doctor: the patient has arrived → waiting. A late patient is placed by
   * the clinic's late-arrival rule (the server decides).
   */
  const checkInPatient = async (p: TodayPatient) => {
    if (checkingIn !== null) {
      return;
    }
    setCheckingIn(p.appointmentId);
    try {
      await checkIn(p.appointmentId);
    } catch (e) {
      Alert.alert('Could not check in', userMessage(e, 'Please try again.'));
    } finally {
      await fetchPatients(true);
      if (mounted.current) {
        setCheckingIn(null);
      }
    }
  };

  // Search every registered patient once typing pauses.
  const trimmed = query.trim();
  const searchRegistry = trimmed.length >= REGISTRY_MIN_CHARS;
  useEffect(() => {
    if (!searchRegistry) {
      setRegistry({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setRegistry({ status: 'loading' });
    const timer = setTimeout(async () => {
      try {
        const items = await searchPatients(trimmed);
        if (!cancelled) {
          setRegistry({
            status: 'ready',
            items: Array.isArray(items) ? items : [],
          });
        }
      } catch {
        if (!cancelled) {
          setRegistry({ status: 'error' });
        }
      }
    }, REGISTRY_SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, searchRegistry]);

  const patients = useMemo(
    () => (load.status === 'ready' ? load.patients : []),
    [load],
  );
  const searched = useMemo(
    () => patients.filter(p => matchesQuery(p, query)),
    [patients, query],
  );
  const activeFilter = FILTERS.find(f => f.key === filter) ?? FILTERS[0];
  const visible = searched.filter(activeFilter.match);
  // Registered patients who are not already in today's list.
  const others = useMemo(() => {
    if (registry.status !== 'ready') {
      return [];
    }
    const today = new Set(patients.map(p => p.patientId));
    return registry.items.filter(r => !today.has(r.id));
  }, [registry, patients]);

  const subtitlePlace =
    place ?? (load.status === 'ready' ? load.room : null) ?? '';

  return (
    <View style={styles.screen}>
      {/* Header, search and filters */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
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
            <Text style={styles.title}>Patients</Text>
            <Text style={styles.subtitle}>
              {[
                'Today',
                subtitlePlace,
                load.status === 'ready'
                  ? `${patients.length} ${
                      patients.length === 1 ? 'patient' : 'patients'
                    }`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {/* Add patient (+), hidden for now:
          {onAddPatient ? (
            <Pressable
              testID="add-patient"
              onPress={onAddPatient}
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add patient"
            >
              <Plus size={22} color={colors.white} strokeWidth={2.5} />
            </Pressable>
          ) : null}
          */}
        </View>

        {load.status === 'ready' ? (
          <>
            <SearchBox
              testID="patient-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Search name, token, phone or PT code"
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
          </>
        ) : null}
      </View>

      {load.status === 'loading' ? (
        <LoadingView
          testID="patients-loading"
          label="Loading today’s patients…"
        />
      ) : load.status === 'error' ? (
        <ErrorView
          testID="patients-error"
          message={load.message}
          onRetry={() => fetchPatients(false)}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={p => String(p.appointmentId)}
          renderItem={({ item }) => (
            <PatientCard
              patient={item}
              viewer={viewer}
              checkIn={
                // The desk checks in from its Tokens screen.
                viewer === 'doctor' && item.status === 'not_arrived'
                  ? {
                      busy: checkingIn === item.appointmentId,
                      disabled: checkingIn !== null,
                      onPress: () => checkInPatient(item),
                    }
                  : undefined
              }
            />
          )}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={pullToRefresh}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <Text testID="patients-empty" style={styles.empty}>
              {trimmed
                ? `No patients today match "${trimmed}".`
                : filter === 'all'
                ? 'No patients booked for today yet.'
                : 'No patients here right now.'}
            </Text>
          }
          ListFooterComponent={
            searchRegistry && filter === 'all' ? (
              <RegistrySection registry={registry} others={others} />
            ) : undefined
          }
        />
      )}
    </View>
  );
}

function PatientCard({
  patient: p,
  viewer,
  checkIn: checkInButton,
}: {
  patient: TodayPatient;
  viewer: PatientListViewer;
  /** "Check in" on a patient who hasn't arrived yet. */
  checkIn?: { busy: boolean; disabled: boolean; onPress: () => void };
}) {
  const inRoom = p.status === 'in_room';
  const seen = p.status === 'seen';
  const avatar = avatarColorsFor(p.name, seen);
  const meta = [
    p.ageGender,
    p.time,
    viewer === 'assistant' ? shortDoctorName(p.doctorName) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      testID={`patient-${p.appointmentId}`}
      style={[styles.card, inRoom && styles.cardInRoom]}
    >
      <View style={styles.cardTop}>
        <Avatar
          name={p.name}
          size={46}
          background={avatar.bg}
          color={avatar.fg}
        />
        <View style={styles.flex}>
          <Text
            style={[styles.name, seen && styles.textSeen]}
            numberOfLines={1}
          >
            {p.name}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <View style={styles.tokenBadge}>
          <Text style={styles.tokenText}>{p.token}</Text>
        </View>
      </View>

      {p.complaint ? (
        <Text style={[styles.complaint, seen && styles.textSeen]}>
          {p.complaint}
        </Text>
      ) : null}
      {p.lastVisit ? (
        <Text style={styles.lastVisit} numberOfLines={1}>
          {`Last visit ${p.lastVisit}`}
        </Text>
      ) : null}

      <View style={styles.tagRow}>
        <StatusTag status={p.status} viewer={viewer} />
        {p.lateMinutes > 0 ? (
          <Tag
            text={`Late · ${p.lateMinutes} min`}
            bg={colors.warningSoft}
            fg={colors.warningText}
          />
        ) : null}
        {p.source === 'online' ? (
          <Tag text="Online" bg={colors.tealSoft} fg={colors.tealText} />
        ) : p.source === 'walk_in' ? (
          <Tag text="Walk-in" bg={colors.purpleSoft} fg={colors.purple} />
        ) : (
          <Tag
            text={p.sourceLabel}
            bg={colors.neutralSoft}
            fg={colors.neutralText}
          />
        )}
        {p.isNew ? (
          <Tag text="New patient" bg={colors.primarySoft} fg={colors.primary} />
        ) : null}
      </View>

      {checkInButton ? (
        <Pressable
          testID={`check-in-${p.appointmentId}`}
          onPress={checkInButton.onPress}
          disabled={checkInButton.disabled}
          style={({ pressed }) => [
            styles.checkInButton,
            (pressed || checkInButton.disabled) && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Check in ${p.token} ${p.name}`}
          accessibilityState={{
            disabled: checkInButton.disabled,
            busy: checkInButton.busy,
          }}
        >
          {checkInButton.busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.checkInText}>Check in</Text>
          )}
        </Pressable>
      ) : null}

      {/* Edit details · Rx list · Last Rx · History, hidden for now:
      <View style={styles.divider} />

      <View style={styles.actions}>
        {ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <Pressable
              key={action.key}
              testID={`${action.key}-${p.appointmentId}`}
              onPress={() => comingSoon(`${action.feature} · ${p.name}`)}
              style={({ pressed }) => [
                styles.actionTile,
                action.highlight && styles.actionTileHighlight,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${action.label} for ${p.name}`}
            >
              <Icon size={18} color={colors.text} />
              <Text style={styles.actionLabel} numberOfLines={1}>
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      */}
    </View>
  );
}

function StatusTag({
  status,
  viewer,
}: {
  status: PatientStatus;
  viewer: PatientListViewer;
}) {
  switch (status) {
    case 'in_room':
      return (
        <Tag
          text={viewer === 'doctor' ? 'In your room' : 'With doctor'}
          bg={colors.primary}
          fg={colors.white}
        />
      );
    case 'waiting':
      return (
        <Tag text="Waiting" bg={colors.successSoft} fg={colors.successText} />
      );
    case 'not_arrived':
      return (
        <Tag
          text="Not arrived"
          bg={colors.neutralSoft}
          fg={colors.neutralText}
        />
      );
    case 'seen':
      return (
        <Tag
          text="Seen"
          bg={colors.surface}
          fg={colors.muted}
          border={colors.border}
        />
      );
  }
}

/** Registered patients matching the search who aren't booked today. */
function RegistrySection({
  registry,
  others,
}: {
  registry: Registry;
  others: RegisteredPatient[];
}) {
  return (
    <View testID="registry" style={styles.registry}>
      <Text style={styles.sectionTitle}>Other registered patients</Text>
      {registry.status === 'ready' && others.length > 0 ? (
        others.map(p => <RegisteredCard key={p.id} patient={p} />)
      ) : (
        <Text testID="registry-note" style={styles.registryNote}>
          {registry.status === 'error'
            ? 'Could not search all patients right now.'
            : registry.status === 'ready'
            ? 'No other registered patients match.'
            : 'Searching all patients…'}
        </Text>
      )}
    </View>
  );
}

function RegisteredCard({ patient: p }: { patient: RegisteredPatient }) {
  const avatar = avatarColorsFor(p.fullName);
  const visits =
    p.visitCount > 0
      ? [
          `${p.visitCount} ${p.visitCount === 1 ? 'visit' : 'visits'}`,
          p.lastVisitDate ? `last ${formatIsoDate(p.lastVisitDate)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : 'No visits yet';
  return (
    <View testID={`registered-${p.id}`} style={[styles.card, styles.cardTop]}>
      <Avatar
        name={p.fullName}
        size={40}
        background={avatar.bg}
        color={avatar.fg}
      />
      <View style={styles.flex}>
        <Text style={styles.name} numberOfLines={1}>
          {p.fullName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[p.ageGender, p.patientCode].join(' · ')}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {visits}
        </Text>
      </View>
    </View>
  );
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
    paddingBottom: 12,
    gap: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: '700', color: colors.navy },
  subtitle: { marginTop: 1, fontSize: 13, color: colors.muted },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // List
  list: { padding: 16, gap: 12, paddingBottom: 24 },
  empty: {
    marginTop: 32,
    textAlign: 'center',
    fontSize: 14,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  cardInRoom: {
    backgroundColor: colors.selectedSoft,
    borderColor: colors.primary,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  textSeen: { color: colors.neutralText },
  meta: { marginTop: 1, fontSize: 13, color: colors.muted },
  tokenBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tokenText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  complaint: { marginTop: 12, fontSize: 15, color: colors.text },
  lastVisit: { marginTop: 4, fontSize: 13, color: colors.muted },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  // Same look as the desk's "Check in" (assistant Tokens screen).
  checkInButton: {
    marginTop: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkInText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  actionTile: {
    flex: 1,
    height: 58,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionTileHighlight: { backgroundColor: colors.primarySoft },
  actionLabel: { fontSize: 12, fontWeight: '500', color: colors.text },

  // Registry search
  registry: { marginTop: 12, gap: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  registryNote: { fontSize: 14, color: colors.muted },
});
