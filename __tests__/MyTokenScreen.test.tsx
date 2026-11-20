/**
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import * as myApi from '../src/api/myAppointments';
import MyTokenScreen from '../src/screens/patient/MyTokenScreen';
import { NOW, myAppointment, myDetail } from '../test-utils/fixtures';
import { flush, mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/myAppointments', () => ({
  listMyAppointments: jest.fn(),
  getMyAppointment: jest.fn(),
  cancelMyAppointment: jest.fn(),
}));

const api = myApi as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  pinDate(NOW);
  api.listMyAppointments
    .mockReset()
    .mockResolvedValue([
      myAppointment(30, { opdDate: '2026-11-25' }),
      myAppointment(13),
    ]);
  api.getMyAppointment.mockReset().mockResolvedValue(myDetail(13));
  api.cancelMyAppointment.mockReset();
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function renderToken(params?: { appointmentId?: number }) {
  const navigation = { goBack: jest.fn(), replace: jest.fn() };
  return mount(
    <MyTokenScreen
      navigation={navigation as never}
      route={{ key: 'TokenStatus', name: 'TokenStatus', params } as never}
    />,
  ).then(s => ({ ...s, navigation }));
}

test("tracks today's appointment: token, estimate, people ahead, progress", async () => {
  const s = await renderToken();
  expect(api.listMyAppointments).toHaveBeenCalledWith('upcoming');
  expect(api.getMyAppointment).toHaveBeenCalledWith(13); // today's, not the 25th
  expect(s.textIn('token-value')).toBe('A-13');
  expect(s.textIn('token-headline')).toBe('NOT ARRIVED YET');
  expect(s.textIn('stat-eta')).toBe('10:50 AM');
  expect(s.textIn('stat-ahead')).toBe('2');
  expect(s.textIn('stat-position')).toBe('#2');
  expect(s.textIn('token-banner')).toContain(
    'Check in at the desk when you arrive.',
  );
  expect(s.allText()).toContain(
    'Dr. Sarah Johnson · Room 103 · Sunrise Clinic',
  );
  expect(s.allText()).toContain('Wed, 18 Nov · APT-20261118-013');
  expect(s.textIn('step-checked_in')).toContain(
    'Check in at the desk when you arrive',
  );
  expect(s.exists('cancel-appointment')).toBe(true);
});

test('opens a given appointment without searching the list', async () => {
  await renderToken({ appointmentId: 30 });
  expect(api.listMyAppointments).not.toHaveBeenCalled();
  expect(api.getMyAppointment).toHaveBeenCalledWith(30);
});

test('refresh shows "Your turn is next" when the queue reaches you', async () => {
  const s = await renderToken();
  api.getMyAppointment.mockResolvedValue(
    myDetail(13, {
      status: 'checked_in',
      queueStatus: {
        position: 1,
        peopleAhead: 1,
        estimatedTime: '10:40',
        estimatedTimeLabel: '10:40 AM',
        upNext: true,
        inRoom: false,
        late: false,
      },
    }),
  );
  await s.press('refresh');
  expect(s.textIn('token-banner')).toContain('Your turn is next');
  expect(s.textIn('token-banner')).toContain(
    "Please proceed to the doctor's cabin · Dr. Sarah Johnson · Room 103.",
  );
  expect(s.textIn('token-headline')).toBe("YOU'RE NEXT");
});

test('moved for being late: says so, with the new estimated time', async () => {
  api.getMyAppointment.mockResolvedValue(
    myDetail(13, {
      slotTime: '11:00',
      slotLabel: '11:00 AM',
      originalSlotTime: '10:30',
      queueStatus: {
        position: 3,
        peopleAhead: 3,
        estimatedTime: '11:05',
        estimatedTimeLabel: '11:05 AM',
        upNext: false,
        inRoom: false,
        late: false,
      },
    }),
  );
  const s = await renderToken();
  expect(s.textIn('token-banner')).toContain('Your time has moved');
  expect(s.textIn('token-banner')).toContain('moved to 11:00 AM');
  expect(s.textIn('stat-eta')).toBe('11:05 AM');
});

test('cancel asks first, then shows the cancelled appointment', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  api.cancelMyAppointment.mockResolvedValue(
    myDetail(13, {
      status: 'cancelled',
      statusLabel: 'Cancelled',
      queueStatus: null,
    }),
  );
  const s = await renderToken();
  await s.press('cancel-appointment');
  const buttons = alert.mock.calls[0][2] as {
    text: string;
    onPress?: () => void;
  }[];
  expect(alert.mock.calls[0][0]).toBe('Cancel appointment?');
  expect(buttons.map(b => b.text)).toEqual(['Keep it', 'Cancel appointment']);
  await ReactTestRenderer.act(async () => {
    buttons[1].onPress?.();
  });
  await flush();
  expect(api.cancelMyAppointment).toHaveBeenCalledWith(13);
  expect(s.textIn('token-banner')).toContain('Appointment cancelled');
  expect(s.exists('cancel-appointment')).toBe(false);
});

test('no upcoming visit: offers to book', async () => {
  api.listMyAppointments.mockResolvedValue([
    myAppointment(5, { status: 'completed' }),
  ]);
  const s = await renderToken();
  expect(s.textIn('no-token')).toContain('No upcoming visit');
  await s.press('book-now');
  expect(s.navigation.replace).toHaveBeenCalledWith('BookAppointment');
  await s.press('see-past');
  expect(s.navigation.replace).toHaveBeenCalledWith('MyAppointments', {
    tab: 'past',
  });
});

test('load failure offers "Try again"', async () => {
  const { ApiError } = jest.requireActual('../src/api/client');
  api.listMyAppointments.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderToken();
  expect(s.textIn('token-error')).toContain("Can't reach the server.");
  await s.press('token-error-retry');
  expect(s.textIn('token-value')).toBe('A-13');
});
