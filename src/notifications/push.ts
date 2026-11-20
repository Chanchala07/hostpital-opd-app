// Push notifications through Firebase Cloud Messaging (FCM).
//
// The server sends every in-app notification as a push too ("Your turn is
// next", "Your appointment time has moved", "A-14 called to Room 103"…) to the
// tokens registered with POST /devices. While the app is in the background
// Android shows them itself; while it is open the app shows its own banner.
//
// If Firebase isn't set up in this build (no google-services.json), every
// function here quietly does nothing and the app keeps polling instead.

import { PermissionsAndroid, Platform } from 'react-native';
import {
  AuthorizationStatus,
  getInitialNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
  requestPermission,
  setBackgroundMessageHandler,
  type Messaging,
  type RemoteMessage,
} from '@react-native-firebase/messaging';
import { registerDevice, removeDevice } from '../api/devices';

/** A push as the app uses it: the server's notification type and data. */
export type PushMessage = {
  type: string;
  title: string;
  body: string;
  /** e.g. { appointmentId: "13", token: "A-13" } — FCM sends strings only. */
  data: Record<string, string>;
};

/** Firebase messaging, or null when Firebase isn't configured in this build. */
function fcm(): Messaging | null {
  try {
    return getMessaging(); // created once, then reused by Firebase
  } catch {
    return null; // "No Firebase App '[DEFAULT]' has been created"
  }
}

export const pushAvailable = () => fcm() !== null;

export function toPushMessage(message: RemoteMessage): PushMessage {
  const data: Record<string, string> = {};
  Object.entries(message.data ?? {}).forEach(([key, value]) => {
    data[key] = typeof value === 'string' ? value : JSON.stringify(value);
  });
  return {
    type: data.type ?? '',
    title: message.notification?.title ?? '',
    body: message.notification?.body ?? '',
    data,
  };
}

/**
 * Runs once at start-up, before the app registers (index.js). Android shows
 * pushes that arrive in the background by itself; nothing else to do then.
 */
export function setUpBackgroundPush() {
  const m = fcm();
  if (m) {
    setBackgroundMessageHandler(m, async () => {});
  }
}

/** Android 13+ asks the user; older versions allow notifications by default. */
async function allowNotifications(m: Messaging): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (Number(Platform.Version) < 33) {
      return true;
    }
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }
  const status = await requestPermission(m);
  return (
    status === AuthorizationStatus.AUTHORIZED ||
    status === AuthorizationStatus.PROVISIONAL
  );
}

/** The token registered for the signed-in user, so sign-out can remove it. */
let registeredToken: string | null = null;

/**
 * After sign-in: asks to allow notifications and registers this phone's FCM
 * token for the user. Returns false when push isn't available here. The token
 * is registered even if notifications are blocked: pushes still reach the app
 * while it is open.
 */
export async function startPush(): Promise<boolean> {
  const m = fcm();
  if (!m) {
    if (__DEV__) {
      console.warn(
        'Push notifications are off: Firebase is not set up in this build. ' +
          'Add android/app/google-services.json and rebuild the app.',
      );
    }
    return false;
  }
  try {
    await allowNotifications(m).catch(() => false);
    const token = await getToken(m);
    await registerDevice(token);
    registeredToken = token;
    return true;
  } catch (error) {
    if (__DEV__) {
      console.warn('Push notifications: could not register this phone.', error);
    }
    return false; // offline, or no Google Play services: polling still works
  }
}

/** FCM rotated the token: register the new one while signed in. */
export function onPushTokenChange(): () => void {
  const m = fcm();
  if (!m) {
    return () => {};
  }
  return onTokenRefresh(m, token => {
    if (registeredToken === null) {
      return;
    }
    registerDevice(token)
      .then(() => {
        registeredToken = token;
      })
      .catch(() => undefined);
  });
}

/**
 * On sign-out, before the session ends: stop pushes for this user to this
 * phone. Best effort — the next sign-in moves the token to that user anyway.
 */
export async function stopPush(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (token) {
    await removeDevice(token).catch(() => undefined);
  }
}

/** A push that arrives while the app is open (Android shows nothing then). */
export function onForegroundPush(
  listener: (push: PushMessage) => void,
): () => void {
  const m = fcm();
  return m ? onMessage(m, message => listener(toPushMessage(message))) : () => {};
}

/** The user tapped a push while the app was in the background. */
export function onPushOpened(
  listener: (push: PushMessage) => void,
): () => void {
  const m = fcm();
  return m
    ? onNotificationOpenedApp(m, message => listener(toPushMessage(message)))
    : () => {};
}

/** The push the user tapped to start the app, if any. */
export async function launchPush(): Promise<PushMessage | null> {
  const m = fcm();
  if (!m) {
    return null;
  }
  try {
    const message = await getInitialNotification(m);
    return message ? toPushMessage(message) : null;
  } catch {
    return null;
  }
}
