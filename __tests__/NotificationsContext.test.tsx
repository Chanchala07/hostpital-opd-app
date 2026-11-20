/**
 * @format
 */

import React from 'react';
import { AppState, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import * as notificationsApi from '../src/api/notifications';
import type { AppNotification } from '../src/api/notifications';
import {
  NOTIFICATION_POLL_MS,
  NotificationsProvider,
  useNotifications,
} from '../src/notifications/NotificationsContext';
import * as push from '../src/notifications/push';
import type { PushMessage } from '../src/notifications/push';
import { mount, unmountAll } from '../test-utils/render';

jest.mock('../src/api/notifications', () => ({
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(),
}));

jest.mock('../src/notifications/push', () => ({
  startPush: jest.fn(),
  onPushTokenChange: jest.fn(),
  onForegroundPush: jest.fn(),
  onPushOpened: jest.fn(),
  launchPush: jest.fn(),
}));

const list = notificationsApi.listNotifications as jest.Mock;
const markRead = notificationsApi.markNotificationRead as jest.Mock;

const note = (
  id: number,
  type: string,
  title: string,
  body: string,
): AppNotification => ({
  id,
  type,
  title,
  body,
  data: { appointmentId: 13 },
  read: false,
  createdAt: '2026-11-18T05:00:00.000Z',
});

const OLD = note(
  1,
  'booking_confirmed',
  'Booking confirmed',
  'A-13 at 10:30 AM',
);
const UP_NEXT = note(
  2,
  'up_next',
  'Your turn is next',
  "Your turn is next (token A-13). Please proceed to the doctor's cabin · Dr. Sarah Johnson · Room 103.",
);

function Unread() {
  const { unreadCount, latest } = useNotifications();
  return <Text testID="unread">{`${unreadCount}|${latest?.id ?? '-'}`}</Text>;
}

beforeEach(() => {
  jest.useFakeTimers();
  list.mockReset().mockResolvedValue({ items: [OLD], unreadCount: 1 });
  markRead.mockReset().mockResolvedValue(null);
  (push.startPush as jest.Mock).mockReset().mockResolvedValue(true);
  (push.onPushTokenChange as jest.Mock).mockReset().mockReturnValue(() => {});
  (push.onForegroundPush as jest.Mock).mockReset().mockReturnValue(() => {});
  (push.onPushOpened as jest.Mock).mockReset().mockReturnValue(() => {});
  (push.launchPush as jest.Mock).mockReset().mockResolvedValue(null);
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
});

async function tick() {
  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(NOTIFICATION_POLL_MS);
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
}

async function renderProvider(enabled = true) {
  const onOpen = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <NotificationsProvider enabled={enabled} onOpen={onOpen}>
        <Unread />
      </NotificationsProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
  const has = (testID: string) =>
    renderer.root.findAllByProps({ testID }).length > 0;
  const text = (testID: string) =>
    renderer.root
      .findAllByProps({ testID })[0]
      .findAllByType(Text)
      .map(t => ([] as unknown[]).concat(t.props.children).join(''))
      .join('\n');
  return { renderer, onOpen, has, text };
}

test('unread at sign-in only counts; a new one pops up, is marked read, opens', async () => {
  // SafeAreaProvider is needed by the banner.
  const { SafeAreaProvider } = jest.requireActual(
    'react-native-safe-area-context',
  );
  const onOpen = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <NotificationsProvider enabled onOpen={onOpen}>
          <Unread />
        </NotificationsProvider>
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    await Promise.resolve();
  });
  const byId = (testID: string) => renderer.root.findAllByProps({ testID });
  const unread = () => byId('unread')[0].props.children as string;

  expect(list).toHaveBeenCalledWith(true);
  expect(unread()).toBe('1|-');
  expect(byId('notification-banner')).toHaveLength(0);
  expect(markRead).not.toHaveBeenCalled();

  list.mockResolvedValue({ items: [UP_NEXT, OLD], unreadCount: 2 });
  await tick();
  expect(byId('notification-banner').length).toBeGreaterThan(0);
  expect(markRead).toHaveBeenCalledWith(2);
  expect(unread()).toBe('1|2');

  await ReactTestRenderer.act(async () => {
    byId('notification-banner')
      .find(n => typeof n.props.onPress === 'function')!
      .props.onPress();
  });
  expect(onOpen).toHaveBeenCalledWith(UP_NEXT);
  expect(byId('notification-banner')).toHaveLength(0);

  // Same list again: nothing new to show.
  await tick();
  expect(byId('notification-banner')).toHaveLength(0);

  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('signed out: no polling', async () => {
  const { renderer } = await renderProvider(false);
  expect(list).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('without a provider the hook says nothing is unread', async () => {
  jest.useRealTimers();
  const s = await mount(<Unread />);
  expect(s.textIn('unread')).toBe('0|-');
});

// ── Push ────────────────────────────────────────────────────────────────

const pushOf = (n: AppNotification): PushMessage => ({
  type: n.type,
  title: n.title,
  body: n.body,
  data: { type: n.type, appointmentId: '13' },
});
/** The listeners the provider gave the push module. */
const foregroundPush = () =>
  (push.onForegroundPush as jest.Mock).mock.calls[0][0] as (
    p: PushMessage,
  ) => void;
const openedPush = () =>
  (push.onPushOpened as jest.Mock).mock.calls[0][0] as (p: PushMessage) => void;

async function renderWithBanner(enabled: boolean) {
  const { SafeAreaProvider } = jest.requireActual(
    'react-native-safe-area-context',
  );
  const onOpen = jest.fn();
  const tree = (on: boolean) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <NotificationsProvider enabled={on} onOpen={onOpen}>
        <Unread />
      </NotificationsProvider>
    </SafeAreaProvider>
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  const settle = () =>
    ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(tree(enabled));
  });
  await settle();
  const banners = () =>
    renderer.root
      .findAllByProps({ testID: 'notification-banner' })
      .filter(n => typeof n.props.onPress === 'function');
  const bannerText = () =>
    banners()[0]
      .findAllByType(Text)
      .map(t => ([] as unknown[]).concat(t.props.children).join(''))
      .join('\n');
  const setEnabled = async (on: boolean) => {
    await ReactTestRenderer.act(async () => renderer.update(tree(on)));
    await settle();
  };
  const run = async (fn: () => void) => {
    await ReactTestRenderer.act(async () => fn());
    await settle();
  };
  return { renderer, onOpen, banners, bannerText, setEnabled, run };
}

test('signed in, the phone registers for push; a push while open shows at once', async () => {
  const s = await renderWithBanner(true);
  expect(push.startPush).toHaveBeenCalledTimes(1);
  expect(push.onPushTokenChange).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledTimes(1);

  // Shown from the push itself, without waiting for the server.
  list.mockReturnValue(new Promise(() => {}));
  await s.run(() => foregroundPush()(pushOf(UP_NEXT)));
  expect(s.bannerText()).toBe(`Your turn is next\n${UP_NEXT.body}`);
  expect(list).toHaveBeenCalledTimes(2); // also fetches, for the unread count

  await s.setEnabled(false); // signed out
  expect(s.banners()).toHaveLength(0);
});

test('a push shown while open is marked read, not shown twice', async () => {
  const s = await renderWithBanner(true);
  list.mockResolvedValue({ items: [UP_NEXT, OLD], unreadCount: 2 });
  await s.run(() => foregroundPush()(pushOf(UP_NEXT)));
  expect(markRead).toHaveBeenCalledWith(2);
  await s.run(() => s.banners()[0].props.onPress()); // dismissed by a tap
  expect(s.onOpen).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'up_next' }),
  );

  // The next poll finds nothing new.
  await tick();
  expect(s.banners()).toHaveLength(0);
});

/** The app comes back to the foreground (AppState is mocked in Jest). */
const backInApp = () => {
  const calls = (AppState.addEventListener as jest.Mock).mock.calls;
  (calls[calls.length - 1][1] as (state: string) => void)('active');
};

test('a tapped push opens its screen, and isn’t shown again as a banner', async () => {
  const s = await renderWithBanner(true);
  await s.run(() => openedPush()(pushOf(UP_NEXT)));
  expect(s.onOpen).toHaveBeenCalledWith({
    type: 'up_next',
    title: 'Your turn is next',
    body: UP_NEXT.body,
    data: { type: 'up_next', appointmentId: '13' },
  });

  // Back in the app, polling finds it: marked read, no banner.
  list.mockResolvedValue({ items: [UP_NEXT, OLD], unreadCount: 2 });
  await s.run(backInApp);
  expect(markRead).toHaveBeenCalledWith(2);
  expect(s.banners()).toHaveLength(0);

  // Anything else still shows.
  const CALLED = note(3, 'patient_called', 'A-13 called', 'Room 103');
  list.mockResolvedValue({ items: [CALLED, UP_NEXT, OLD], unreadCount: 3 });
  await s.run(backInApp);
  expect(s.bannerText()).toBe('A-13 called\nRoom 103');
});

test('a push that started the app opens after sign-in', async () => {
  (push.launchPush as jest.Mock).mockResolvedValue(pushOf(UP_NEXT));
  const s = await renderWithBanner(false);
  expect(s.onOpen).not.toHaveBeenCalled();
  expect(push.startPush).not.toHaveBeenCalled();

  await s.setEnabled(true);
  await s.run(() => jest.advanceTimersByTime(0));
  expect(s.onOpen).toHaveBeenCalledTimes(1);
  expect(s.onOpen).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'up_next', title: 'Your turn is next' }),
  );
  expect(push.startPush).toHaveBeenCalled();
});

test('signed out, a push while open shows its own banner', async () => {
  const s = await renderWithBanner(false);
  await s.run(() => foregroundPush()(pushOf(UP_NEXT)));
  expect(list).not.toHaveBeenCalled();
  expect(s.bannerText()).toBe(`Your turn is next\n${UP_NEXT.body}`);

  // Tapped: opens once signed in.
  await s.run(() => s.banners()[0].props.onPress());
  expect(s.onOpen).not.toHaveBeenCalled();
  await s.setEnabled(true);
  await s.run(() => jest.advanceTimersByTime(0));
  expect(s.onOpen).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'up_next' }),
  );
});
