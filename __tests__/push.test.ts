/**
 * @format
 */

import { PermissionsAndroid, Platform } from 'react-native';
import * as fcm from '@react-native-firebase/messaging';
import * as devicesApi from '../src/api/devices';
import * as push from '../src/notifications/push';

jest.mock('../src/api/devices', () => ({
  registerDevice: jest.fn(),
  removeDevice: jest.fn(),
}));

const registerDevice = devicesApi.registerDevice as jest.Mock;
const removeDevice = devicesApi.removeDevice as jest.Mock;
const getMessaging = fcm.getMessaging as jest.Mock;
const getToken = fcm.getToken as jest.Mock;
const requestPermission = fcm.requestPermission as jest.Mock;
const onTokenRefresh = fcm.onTokenRefresh as jest.Mock;
const onMessage = fcm.onMessage as jest.Mock;
const getInitialNotification = fcm.getInitialNotification as jest.Mock;


const UP_NEXT = {
  messageId: 'm1',
  notification: {
    title: 'Your turn is next',
    body: "Your turn is next (token A-13). Please proceed to the doctor's cabin · Dr. Sarah Johnson · Room 103.",
  },
  data: { type: 'up_next', appointmentId: '13', token: 'A-13' },
};

beforeEach(() => {
  jest.clearAllMocks();
  getMessaging.mockImplementation(() => ({ name: 'test-messaging' }));
  getToken.mockResolvedValue('fcm-token-1');
  requestPermission.mockResolvedValue(fcm.AuthorizationStatus.AUTHORIZED);
  registerDevice.mockResolvedValue(null);
  removeDevice.mockResolvedValue(null);
});

afterEach(async () => {
  await push.stopPush(); // forget the registered token
  jest.restoreAllMocks();
});

test('a push becomes the app’s notification type, text and data', () => {
  expect(push.toPushMessage(UP_NEXT)).toEqual({
    type: 'up_next',
    title: 'Your turn is next',
    body: UP_NEXT.notification.body,
    data: { type: 'up_next', appointmentId: '13', token: 'A-13' },
  });
  expect(push.toPushMessage({})).toEqual({
    type: '',
    title: '',
    body: '',
    data: {},
  });
});

test('after sign-in it asks to allow notifications and registers the token; sign-out removes it', async () => {
  await expect(push.startPush()).resolves.toBe(true);
  expect(requestPermission).toHaveBeenCalled(); // iOS in Jest
  expect(registerDevice).toHaveBeenCalledWith('fcm-token-1');

  await push.stopPush();
  expect(removeDevice).toHaveBeenCalledWith('fcm-token-1');
  await push.stopPush(); // nothing registered any more
  expect(removeDevice).toHaveBeenCalledTimes(1);
});

test('Android 13+ asks for the notification permission; the token is registered even if refused', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  const ask = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  await expect(push.startPush()).resolves.toBe(true);
  expect(ask).toHaveBeenCalledWith(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  expect(requestPermission).not.toHaveBeenCalled();
  expect(registerDevice).toHaveBeenCalledWith('fcm-token-1');
});

test('older Android doesn’t ask', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(30);
  const ask = jest.spyOn(PermissionsAndroid, 'request');
  await push.startPush();
  expect(ask).not.toHaveBeenCalled();
  expect(registerDevice).toHaveBeenCalledWith('fcm-token-1');
});

test('a new token is registered while signed in, not after sign-out', async () => {
  await push.startPush();
  const off = push.onPushTokenChange();
  const refreshed = onTokenRefresh.mock.calls[0][1] as (t: string) => void;

  refreshed('fcm-token-2');
  await Promise.resolve();
  expect(registerDevice).toHaveBeenLastCalledWith('fcm-token-2');
  await Promise.resolve();
  await push.stopPush();
  expect(removeDevice).toHaveBeenCalledWith('fcm-token-2');

  registerDevice.mockClear();
  refreshed('fcm-token-3');
  expect(registerDevice).not.toHaveBeenCalled();
  expect(typeof off).toBe('function');
});

test('offline at sign-in: no push, nothing thrown', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  registerDevice.mockRejectedValue(new Error("Can't reach the server."));
  await expect(push.startPush()).resolves.toBe(false);
  await push.stopPush();
  expect(removeDevice).not.toHaveBeenCalled();
});

test('foreground and launch pushes reach the app as PushMessages', async () => {
  const listener = jest.fn();
  push.onForegroundPush(listener);
  (onMessage.mock.calls[0][1] as (m: unknown) => void)(UP_NEXT);
  expect(listener).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'up_next', title: 'Your turn is next' }),
  );

  getInitialNotification.mockResolvedValueOnce(UP_NEXT);
  await expect(push.launchPush()).resolves.toMatchObject({
    type: 'up_next',
    data: { appointmentId: '13' },
  });
});

test('without Firebase set up in the build, everything is a quiet no-op', async () => {
  getMessaging.mockImplementation(() => {
    throw new Error("No Firebase App '[DEFAULT]' has been created");
  });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(push.pushAvailable()).toBe(false);
  expect(() => push.setUpBackgroundPush()).not.toThrow();
  await expect(push.startPush()).resolves.toBe(false);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining('google-services.json'),
  );
  await expect(push.launchPush()).resolves.toBeNull();
  expect(typeof push.onForegroundPush(jest.fn())).toBe('function');
  expect(typeof push.onPushOpened(jest.fn())).toBe('function');
  expect(registerDevice).not.toHaveBeenCalled();
  expect(onMessage).not.toHaveBeenCalled();
});
