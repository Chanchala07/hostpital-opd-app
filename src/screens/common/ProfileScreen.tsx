import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronRight,
  KeyRound,
  PenLine,
  UserPlus,
} from 'lucide-react-native';
import { useAuth } from '../../auth/AuthContext';
import type { Role } from '../../auth/types';
import Avatar from '../../components/Avatar';
import SignOutButton from '../../components/SignOutButton';
import { colors } from '../../theme/colors';
import { comingSoon } from '../../utils/format';
import { getMyProfile } from '../../api/profile';
import {
  toProfileDetails,
  type ProfileDetails,
  type ProfileSection,
} from './profileDetails';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; details: ProfileDetails }
  | { status: 'error'; message: string };

const ROLE_LABELS: Record<Role, string> = {
  doctor: 'Doctor',
  patient: 'Patient',
  assistant: 'Assistant',
};

/** Same avatar colours as each role's home screen. */
const AVATAR_COLORS: Record<Role, { bg: string; fg: string }> = {
  doctor: { bg: colors.headerBg, fg: colors.primary },
  patient: { bg: colors.pinkSoft, fg: colors.pinkText },
  assistant: { bg: colors.successSoft, fg: colors.successText },
};

type Props = {
  /** Shows a back arrow (when opened on top of the tabs). */
  onBack?: () => void;
  /** Doctors: shows "Add doctor or assistant". */
  onAddStaff?: () => void;
};

/** Profile for every role: who you are, role details, settings, sign out. */
export default function ProfileScreen({ onBack, onAddStaff }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  // GET /auth/me (sent with the Bearer token by the API client).
  const load = useCallback(async () => {
    try {
      const details = toProfileDetails(await getMyProfile());
      if (mounted.current) {
        setState({ status: 'ready', details });
      }
    } catch (e) {
      if (mounted.current) {
        setState({
          status: 'error',
          message:
            e instanceof Error ? e.message : 'Could not load your profile.',
        });
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  const retry = () => {
    setState({ status: 'loading' });
    load();
  };

  if (!user) {
    return null;
  }
  const avatar = AVATAR_COLORS[user.role];
  const details = state.status === 'ready' ? state.details : null;
  // Until the profile loads, show what sign-in already told us.
  const name = details?.name ?? user.name;
  const headline =
    details?.headline ?? (state.status === 'loading' ? 'Loading…' : '');

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {onBack ? (
          <Pressable
            testID="back"
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <Text style={styles.title}>Profile</Text>
      </View>

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
        {/* Who you are */}
        <View style={[styles.card, styles.identity]}>
          <Avatar
            name={name}
            size={56}
            background={avatar.bg}
            color={avatar.fg}
          />
          <View style={styles.identityText}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.identityMeta}>
              <View style={styles.roleChip}>
                <Text style={styles.roleText}>{ROLE_LABELS[user.role]}</Text>
              </View>
              <Text style={styles.headline} numberOfLines={1}>
                {headline}
              </Text>
            </View>
          </View>
          <Pressable
            testID="edit-profile"
            onPress={() => comingSoon('Edit profile')}
            hitSlop={6}
            style={({ pressed }) => [
              styles.editButton,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <PenLine size={18} color={colors.primary} />
          </Pressable>
        </View>

        {/* Role details from the API */}
        {state.status === 'ready' ? (
          state.details.sections.map(section => (
            <DetailsCard key={section.title} section={section} />
          ))
        ) : state.status === 'loading' ? (
          <View
            testID="profile-loading"
            style={[styles.card, styles.stateCard]}
          >
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={[styles.card, styles.stateCard]}>
            <Text testID="profile-error" style={styles.stateText}>
              {state.message}
            </Text>
            <Pressable
              testID="profile-retry"
              onPress={retry}
              style={({ pressed }) => [
                styles.retryButton,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}

        {/* Clinic team (doctors only) */}
        {onAddStaff ? (
          <View style={[styles.card, styles.listCard]}>
            <Text style={[styles.sectionTitle, styles.listTitle]}>
              Clinic team
            </Text>
            <Pressable
              testID="add-staff"
              onPress={onAddStaff}
              style={({ pressed }) => [
                styles.settingRow,
                pressed && styles.rowPressed,
              ]}
              accessibilityRole="button"
            >
              <UserPlus size={20} color={colors.text} />
              <Text style={styles.settingLabel}>Add doctor or assistant</Text>
              <ChevronRight size={18} color={colors.placeholder} />
            </Pressable>
          </View>
        ) : null}

        {/* Settings */}
        <View style={[styles.card, styles.listCard]}>
          <Text style={[styles.sectionTitle, styles.listTitle]}>Settings</Text>
          <Pressable
            testID="setting-password"
            onPress={() => comingSoon('Change password')}
            style={({ pressed }) => [
              styles.settingRow,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
          >
            <KeyRound size={20} color={colors.text} />
            <Text style={styles.settingLabel}>Change password</Text>
            <ChevronRight size={18} color={colors.placeholder} />
          </Pressable>
        </View>

        <SignOutButton />
        <Text style={styles.footer}>SWAP INFOTECH · Hospital OPD</Text>
      </ScrollView>
    </View>
  );
}

function DetailsCard({ section }: { section: ProfileSection }) {
  return (
    <View
      testID={`section-${section.title}`}
      style={[styles.card, styles.listCard]}
    >
      <Text style={[styles.sectionTitle, styles.listTitle]}>
        {section.title}
      </Text>
      {section.rows.map((row, i) => (
        <View
          key={row.label}
          style={[
            styles.detailRow,
            i < section.rows.length - 1 && styles.rowDivider,
          ]}
        >
          <Text style={styles.detailLabel}>{row.label}</Text>
          <Text
            style={[
              styles.detailValue,
              row.tone === 'alert' && styles.detailValueAlert,
            ]}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
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

  content: { padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },

  // Identity
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
  },
  identityText: { flex: 1, gap: 6 },
  name: { fontSize: 18, fontWeight: '700', color: colors.navy },
  identityMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleChip: {
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  roleText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  headline: { flexShrink: 1, fontSize: 13, color: colors.muted },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.selectedSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Lists (details + settings)
  listCard: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.navy },
  listTitle: { marginBottom: 4 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 12,
  },
  detailLabel: { fontSize: 14, color: colors.muted },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  detailValueAlert: { color: colors.alertLabel },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
  },
  rowPressed: { opacity: 0.6 },
  settingLabel: { flex: 1, fontSize: 15, color: colors.text },

  // Loading / error
  stateCard: { alignItems: 'center', gap: 12, padding: 20 },
  stateText: { fontSize: 14, color: colors.text, textAlign: 'center' },
  retryButton: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 14, fontWeight: '700', color: colors.white },

  footer: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 12,
    color: colors.placeholder,
  },
});
