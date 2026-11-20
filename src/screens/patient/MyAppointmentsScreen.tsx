import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import {
  listMyAppointments,
  type MyAppointment,
} from '../../api/myAppointments';
import { SegmentedTabs } from '../../components/ListControls';
import { ErrorView, LoadingView } from '../../components/LoadStates';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme/colors';
import { userMessage } from '../../utils/errors';
import { toIsoDate } from './bookingHelpers';
import MyAppointmentCard from './MyAppointmentCard';

type Props = NativeStackScreenProps<RootStackParamList, 'MyAppointments'>;
type TabKey = 'upcoming' | 'past';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: MyAppointment[] };

const EMPTY_TEXT: Record<TabKey, string> = {
  upcoming: 'No upcoming appointments.',
  past: 'No past appointments yet.',
};

/** Patient: all my appointments (every family profile), today's first. */
export default function MyAppointmentsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>(route.params?.tab ?? 'upcoming');
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(0);

  const fetchTab = useCallback(async (key: TabKey, quiet: boolean) => {
    const request = ++latest.current;
    if (!quiet) {
      setLoad({ status: 'loading' });
    }
    try {
      const items = await listMyAppointments(key);
      if (request === latest.current) {
        setLoad({ status: 'ready', items });
      }
    } catch (e) {
      if (request === latest.current && !quiet) {
        setLoad({
          status: 'error',
          message: userMessage(e, 'Could not load your appointments.'),
        });
      }
    }
  }, []);

  useEffect(() => {
    fetchTab(tab, false);
  }, [fetchTab, tab]);

  const refresh = async () => {
    setRefreshing(true);
    await fetchTab(tab, true);
    setRefreshing(false);
  };

  const today = toIsoDate(new Date());
  const items = load.status === 'ready' ? load.items : [];
  const forSeveral = new Set(items.map(a => a.patient.id)).size > 1;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleRow}>
          <Pressable
            testID="back"
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>My appointments</Text>
        </View>
        <SegmentedTabs
          testIDPrefix="tab"
          options={[
            { key: 'upcoming' as const, label: 'Upcoming' },
            { key: 'past' as const, label: 'Past' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {load.status === 'loading' ? (
        <LoadingView label="Loading appointments…" />
      ) : load.status === 'error' ? (
        <ErrorView
          message={load.message}
          onRetry={() => fetchTab(tab, false)}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={a => String(a.id)}
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
          renderItem={({ item, index }) => (
            <View style={styles.item}>
              {tab === 'upcoming' &&
              item.opdDate === today &&
              (index === 0 || items[index - 1].opdDate !== today) ? (
                <Text style={styles.groupLabel}>TODAY</Text>
              ) : null}
              {tab === 'upcoming' &&
              item.opdDate !== today &&
              (index === 0 || items[index - 1].opdDate === today) ? (
                <Text style={styles.groupLabel}>LATER</Text>
              ) : null}
              <MyAppointmentCard
                appointment={item}
                showPatient={forSeveral}
                onPress={() =>
                  navigation.navigate('TokenStatus', { appointmentId: item.id })
                }
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.empty}>{EMPTY_TEXT[tab]}</Text>
              {tab === 'upcoming' ? (
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
              ) : null}
              {tab === 'upcoming' ? (
                <Pressable
                  testID="see-past"
                  onPress={() => setTab('past')}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>See past appointments</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.8 },
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
  list: { padding: 16, gap: 12 },
  item: { gap: 8 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.muted,
  },
  emptyWrap: { alignItems: 'center', marginTop: 32, gap: 16 },
  empty: { fontSize: 14, color: colors.muted, textAlign: 'center' },
  bookButton: {
    height: 46,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: { fontSize: 15, fontWeight: '700', color: colors.white },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
