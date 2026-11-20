import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, X } from 'lucide-react-native';
import {
  listNotifications,
  markNotificationRead,
  type AppNotification,
} from '../api/notifications';
import { colors } from '../theme/colors';
import { appInForeground } from '../utils/appState';
import {
  launchPush,
  onForegroundPush,
  onPushOpened,
  onPushTokenChange,
  startPush,
  type PushMessage,
} from './push';

/** How often the app asks for new notifications while it is open. */
export const NOTIFICATION_POLL_MS = 20 * 1000;
/** How long a banner stays up. */
const BANNER_MS = 8 * 1000;

/** What a banner shows and a tap opens: from the server's list or a push. */
export type OpenableNotification = Pick<
  AppNotification,
  'type' | 'title' | 'body' | 'data'
>;

const fromPush = (push: PushMessage): OpenableNotification => ({
  type: push.type,
  title: push.title,
  body: push.body,
  data: push.data,
});

/** A push and its saved notification carry the same title and text. */
const sameText = (a: OpenableNotification, b: OpenableNotification) =>
  a.title === b.title && a.body === b.body;

const newest = (list: AppNotification[]) =>
  list.reduce((a, b) => (b.id > a.id ? b : a));

type NotificationsValue = {
  unreadCount: number;
  /** The newest notification that arrived while the app was open. */
  latest: AppNotification | null;
};

const NotificationsContext = createContext<NotificationsValue>({
  unreadCount: 0,
  latest: null,
});

export const useNotifications = () => useContext(NotificationsContext);

/**
 * Notifications while the app runs ("Your turn is next", "Your appointment
 * time has moved"…):
 * - Signed in, it registers this phone for push and polls GET /notifications.
 *   A push that arrives while the app is open is fetched at once. New ones
 *   show as a banner and are marked read; ones already waiting at sign-in
 *   only count as unread.
 * - A tapped push opens its screen. Tapped while signed out (the app was
 *   closed), it opens after sign-in.
 */
export function NotificationsProvider({
  enabled,
  onOpen,
  children,
}: {
  enabled: boolean;
  /** Banner or push tapped. */
  onOpen: (notification: OpenableNotification) => void;
  children: React.ReactNode;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [latest, setLatest] = useState<AppNotification | null>(null);
  const [banner, setBanner] = useState<OpenableNotification | null>(null);
  /** Ids already known; null until the first poll after sign-in. */
  const seen = useRef<Set<number> | null>(null);
  /**
   * Pushes already shown or tapped: when polling finds their saved copy, it
   * is marked read without a second banner.
   */
  const handled = useRef<OpenableNotification[]>([]);
  const remember = useCallback((n: OpenableNotification) => {
    handled.current = [...handled.current.slice(-9), n];
  }, []);
  /** Tapped while signed out: opened after sign-in. */
  const pending = useRef<OpenableNotification | null>(null);
  const enabledRef = useRef(enabled);
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    enabledRef.current = enabled;
    onOpenRef.current = onOpen;
  });

  const open = useCallback((n: OpenableNotification) => {
    if (enabledRef.current) {
      onOpenRef.current(n);
    } else {
      pending.current = n;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const { items, unreadCount: unread } = await listNotifications(true);
      if (seen.current === null) {
        seen.current = new Set(items.map(n => n.id));
        setUnreadCount(unread);
        return;
      }
      const known = seen.current;
      const fresh = items.filter(n => !known.has(n.id));
      fresh.forEach(n => known.add(n.id));
      setUnreadCount(Math.max(0, unread - fresh.length));
      if (fresh.length === 0) {
        return;
      }
      setLatest(newest(fresh));
      const unseen = fresh.filter(n => {
        const i = handled.current.findIndex(o => sameText(o, n));
        if (i >= 0) {
          handled.current.splice(i, 1);
        }
        return i < 0;
      });
      if (unseen.length > 0) {
        setBanner(newest(unseen));
      }
      fresh.forEach(n => markNotificationRead(n.id).catch(() => undefined));
    } catch {
      // Offline / signed out meanwhile: try again next time.
    }
  }, []);

  // Pushes, signed in or not.
  useEffect(() => {
    let active = true;
    const openPush = (push: PushMessage) => {
      const n = fromPush(push);
      remember(n);
      setBanner(b => (b && sameText(b, n) ? null : b));
      open(n);
    };
    launchPush().then(push => {
      if (active && push) {
        openPush(push);
      }
    });
    const offOpened = onPushOpened(openPush);
    // Open app: Android shows nothing itself, so the banner shows it at once.
    const offMessage = onForegroundPush(push => {
      const n = fromPush(push);
      if (n.title || n.body) {
        remember(n);
        setBanner(n);
      }
      if (enabledRef.current) {
        poll(); // unread count, and marks the saved copy read
      }
    });
    return () => {
      active = false;
      offOpened();
      offMessage();
    };
  }, [open, poll, remember]);

  useEffect(() => {
    setBanner(null); // it belonged to the user before
    if (!enabled) {
      seen.current = null;
      handled.current = [];
      setUnreadCount(0);
      setLatest(null);
      return;
    }
    const waiting = pending.current;
    pending.current = null;
    // Once the signed-in role's screens are in place.
    const openWaiting = waiting
      ? setTimeout(() => onOpenRef.current(waiting), 0)
      : undefined;
    startPush();
    const offToken = onPushTokenChange();
    poll();
    const timer = setInterval(() => {
      if (appInForeground()) {
        poll();
      }
    }, NOTIFICATION_POLL_MS);
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        poll();
      }
    });
    return () => {
      clearTimeout(openWaiting);
      clearInterval(timer);
      sub.remove();
      offToken();
    };
  }, [enabled, poll]);

  useEffect(() => {
    if (!banner) {
      return;
    }
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner]);

  const value = useMemo(() => ({ unreadCount, latest }), [unreadCount, latest]);

  return (
    <NotificationsContext.Provider value={value}>
      <View style={styles.flex}>
        {children}
        {banner ? (
          <NotificationBanner
            notification={banner}
            onPress={() => {
              setBanner(null);
              open(banner);
            }}
            onClose={() => setBanner(null)}
          />
        ) : null}
      </View>
    </NotificationsContext.Provider>
  );
}

function NotificationBanner({
  notification,
  onPress,
  onClose,
}: {
  notification: OpenableNotification;
  onPress: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const urgent = notification.type === 'up_next';
  return (
    <View
      style={[styles.wrap, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      <Pressable
        testID="notification-banner"
        onPress={onPress}
        style={[styles.banner, urgent && styles.bannerUrgent]}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        <View style={[styles.icon, urgent && styles.iconUrgent]}>
          <Bell size={18} color={urgent ? colors.white : colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, urgent && styles.textUrgent]}>
            {notification.title}
          </Text>
          <Text
            style={[styles.body, urgent && styles.textUrgent]}
            numberOfLines={3}
          >
            {notification.body}
          </Text>
        </View>
        <Pressable
          testID="notification-close"
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <X size={18} color={urgent ? colors.white : colors.muted} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { position: 'absolute', left: 12, right: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bannerUrgent: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUrgent: { backgroundColor: 'rgba(255,255,255,0.25)' },
  title: { fontSize: 15, fontWeight: '700', color: colors.navy },
  body: { marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.text },
  textUrgent: { color: colors.white },
});
