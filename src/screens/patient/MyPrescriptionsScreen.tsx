import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Pill } from 'lucide-react-native';
import {
  listMyPrescriptions,
  MY_PRESCRIPTIONS_PAGE,
  type MyPrescription,
} from '../../api/myPrescriptions';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import type {
  PatientTabParamList,
  RootStackParamList,
} from '../../navigation/types';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import { dateParts } from '../../utils/format';
import {
  dateOf,
  isOngoing,
  medicinesPreview,
  visitTitle,
} from './myPrescriptionHelpers';

type Props = CompositeScreenProps<
  BottomTabScreenProps<PatientTabParamList, 'Prescriptions'>,
  NativeStackScreenProps<RootStackParamList>
>;

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: MyPrescription[]; page: number; more: boolean };

/**
 * Patient · Prescriptions tab: every prescription from every visit (all my
 * family profiles, all clinics), newest first, a page at a time.
 */
export default function MyPrescriptionsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [paging, setPaging] = useState<'idle' | 'loading' | 'error'>('idle');
  /** Newest request; older answers are dropped. */
  const latest = useRef(0);
  const loadingMore = useRef(false);

  const fetchFirst = useCallback(async (quiet: boolean) => {
    const request = ++latest.current;
    if (!quiet) {
      setLoad({ status: 'loading' });
    }
    try {
      const items = await listMyPrescriptions(1);
      if (request === latest.current) {
        setLoad({
          status: 'ready',
          items,
          page: 1,
          more: items.length === MY_PRESCRIPTIONS_PAGE,
        });
        setPaging('idle');
      }
    } catch (e) {
      if (request === latest.current && !quiet) {
        setLoad({
          status: 'error',
          message: userMessage(e, 'Could not load your prescriptions.'),
        });
      }
    }
  }, []);

  useEffect(() => {
    fetchFirst(false);
  }, [fetchFirst]);

  // Back on this tab later (e.g. after a visit): pick up new ones quietly.
  const focusedBefore = useRef(false);
  useEffect(
    () =>
      navigation.addListener('focus', () => {
        if (focusedBefore.current) {
          fetchFirst(true);
        }
        focusedBefore.current = true;
      }),
    [navigation, fetchFirst],
  );

  const loadMore = async () => {
    if (load.status !== 'ready' || !load.more || loadingMore.current) {
      return;
    }
    loadingMore.current = true;
    const request = latest.current;
    const page = load.page + 1;
    setPaging('loading');
    try {
      const next = await listMyPrescriptions(page);
      if (request === latest.current) {
        setLoad(l =>
          l.status === 'ready'
            ? {
                status: 'ready',
                items: [
                  ...l.items,
                  ...next.filter(n => !l.items.some(i => i.id === n.id)),
                ],
                page,
                more: next.length === MY_PRESCRIPTIONS_PAGE,
              }
            : l,
        );
      }
      setPaging('idle');
    } catch {
      setPaging(request === latest.current ? 'error' : 'idle');
    } finally {
      loadingMore.current = false;
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchFirst(true);
    setRefreshing(false);
  };

  const items = load.status === 'ready' ? load.items : [];
  const forSeveral = new Set(items.map(rx => rx.patient.id)).size > 1;
  const severalClinics = new Set(items.map(rx => rx.facility.id)).size > 1;
  const now = new Date();

  return (
    <View style={styles.screen}>
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
          <Text style={styles.title}>Prescriptions</Text>
          <Text style={styles.subtitle}>All your visits, newest first</Text>
        </View>
      </View>

      {load.status === 'loading' ? (
        <LoadingView label="Loading prescriptions…" />
      ) : load.status === 'error' ? (
        <ErrorView message={load.message} onRetry={() => fetchFirst(false)} />
      ) : (
        <FlatList
          testID="prescription-list"
          data={items}
          keyExtractor={rx => String(rx.id)}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              colors={[colors.primary]}
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item, index }) => {
            const year = dateOf(item.date).getFullYear();
            const newYear =
              index === 0 ||
              dateOf(items[index - 1].date).getFullYear() !== year;
            return (
              <View style={styles.item}>
                {newYear ? (
                  <Text style={styles.groupLabel}>{String(year)}</Text>
                ) : null}
                <PrescriptionRow
                  rx={item}
                  ongoing={isOngoing(item, now)}
                  showPatient={forSeveral}
                  showClinic={severalClinics}
                  onPress={() =>
                    navigation.navigate('Prescription', {
                      prescriptionId: item.id,
                    })
                  }
                />
              </View>
            );
          }}
          ListEmptyComponent={
            <View testID="no-prescriptions" style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Pill size={28} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No prescriptions yet</Text>
              <Text style={styles.empty}>
                After a visit, the doctor's prescription shows up here.
              </Text>
              <Pressable
                testID="book-now"
                onPress={() => navigation.navigate('BookAppointment')}
                style={({ pressed }) => [
                  styles.bookButton,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.bookText}>Book appointment</Text>
              </Pressable>
            </View>
          }
          ListFooterComponent={
            paging === 'loading' ? (
              <ActivityIndicator
                testID="loading-more"
                color={colors.primary}
                style={styles.footer}
              />
            ) : paging === 'error' ? (
              <Pressable
                testID="load-more-retry"
                onPress={loadMore}
                style={styles.footer}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Couldn't load more. Try again</Text>
              </Pressable>
            ) : undefined
          }
        />
      )}
    </View>
  );
}

/** One visit's prescription: day, what it was for, doctor and medicines. */
function PrescriptionRow({
  rx,
  ongoing,
  showPatient,
  showClinic,
  onPress,
}: {
  rx: MyPrescription;
  ongoing: boolean;
  /** Family accounts: say who it is for. */
  showPatient: boolean;
  showClinic: boolean;
  onPress: () => void;
}) {
  const { day, month } = dateParts(dateOf(rx.date));
  const title = visitTitle(rx);
  return (
    <Pressable
      testID={`rx-${rx.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${day} ${month}, ${rx.doctor.fullName}`}
    >
      <View style={styles.dateBox}>
        <Text style={styles.dateDay}>{day}</Text>
        <Text style={styles.dateSmall}>{month.toUpperCase()}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {[
            rx.doctor.fullName,
            rx.doctor.departmentName,
            showClinic ? rx.facility.name : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {showPatient ? (
          <Text style={styles.meta} numberOfLines={1}>
            {`For ${rx.patient.fullName}`}
          </Text>
        ) : null}
        <View style={styles.medsRow}>
          <Pill size={14} color={colors.muted} />
          <Text style={styles.meds} numberOfLines={1}>
            {medicinesPreview(rx)}
          </Text>
        </View>
        {ongoing || rx.rxCode ? (
          <View style={styles.tagRow}>
            {ongoing ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>Ongoing</Text>
              </View>
            ) : null}
            {rx.rxCode ? <Text style={styles.code}>{rx.rxCode}</Text> : null}
          </View>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  pressed: { opacity: 0.8 },
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

  list: { padding: 16, gap: 12, flexGrow: 1 },
  item: { gap: 8 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.muted,
  },

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
  dateDay: { fontSize: 20, fontWeight: '800', color: colors.navy },
  dateSmall: { fontSize: 11, fontWeight: '700', color: colors.primary },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { marginTop: 2, fontSize: 13, color: colors.muted },
  medsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  meds: { flex: 1, fontSize: 13, color: colors.text },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    backgroundColor: colors.successSoft,
  },
  badgeText: { fontSize: 12, fontWeight: '700', color: colors.successText },
  code: { fontSize: 12, fontWeight: '600', color: colors.muted },

  footer: { paddingVertical: 16, alignItems: 'center' },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.navy },
  empty: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  bookButton: {
    marginTop: 8,
    height: 46,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: { fontSize: 15, fontWeight: '700', color: colors.white },
});
