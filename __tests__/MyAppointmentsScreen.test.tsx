/**
 * @format
 */

import React from 'react';
import * as myApi from '../src/api/myAppointments';
import MyAppointmentsScreen from '../src/screens/patient/MyAppointmentsScreen';
import { NOW, myAppointment } from '../test-utils/fixtures';
import { mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/myAppointments', () => ({
  listMyAppointments: jest.fn(),
}));

const listMyAppointments = myApi.listMyAppointments as jest.Mock;

beforeEach(() => {
  pinDate(NOW);
  listMyAppointments.mockReset().mockImplementation(async (tab: string) =>
    tab === 'upcoming'
      ? [
          myAppointment(13),
          myAppointment(30, {
            opdDate: '2026-11-20',
            patient: { id: 114, fullName: 'Aarav Nair' },
          }),
        ]
      : [
          myAppointment(5, {
            opdDate: '2026-10-02',
            status: 'completed',
            statusLabel: 'Completed',
          }),
        ],
  );
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
});

async function renderList(params?: { tab?: 'upcoming' | 'past' }) {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const s = await mount(
    <MyAppointmentsScreen
      navigation={navigation as never}
      route={{ key: 'MyAppointments', name: 'MyAppointments', params } as never}
    />,
  );
  return { ...s, navigation };
}

test("upcoming: today's first, then later; family members are named", async () => {
  const s = await renderList();
  expect(listMyAppointments).toHaveBeenCalledWith('upcoming');
  expect(s.allText()).toMatch(/TODAY[\s\S]*Dr. Sarah Johnson[\s\S]*LATER/);
  expect(s.ids(/^my-appointment-/)).toEqual([
    'my-appointment-13',
    'my-appointment-30',
  ]);
  expect(s.textIn('my-appointment-13')).toContain('Token A-13');
  expect(s.textIn('my-appointment-13')).toContain('Confirmed');
  expect(s.textIn('my-appointment-30')).toContain('For Aarav Nair');
});

test('past tab and opening an appointment', async () => {
  const s = await renderList();
  await s.press('my-appointment-13');
  expect(s.navigation.navigate).toHaveBeenCalledWith('TokenStatus', {
    appointmentId: 13,
  });
  await s.press('tab-past');
  expect(listMyAppointments).toHaveBeenLastCalledWith('past');
  expect(s.ids(/^my-appointment-/)).toEqual(['my-appointment-5']);
  expect(s.textIn('my-appointment-5')).toContain('Completed');
});

test('nothing upcoming: offers to book, or to see past appointments', async () => {
  listMyAppointments.mockImplementation(async (tab: string) =>
    tab === 'upcoming' ? [] : [myAppointment(5, { opdDate: '2026-10-02' })],
  );
  const s = await renderList();
  expect(s.allText()).toContain('No upcoming appointments.');
  await s.press('book-now');
  expect(s.navigation.navigate).toHaveBeenCalledWith('BookAppointment');
  await s.press('see-past');
  expect(listMyAppointments).toHaveBeenLastCalledWith('past');
  expect(s.ids(/^my-appointment-/)).toEqual(['my-appointment-5']);
  expect(s.exists('see-past')).toBe(false);
});

test('can open straight on the past tab', async () => {
  const s = await renderList({ tab: 'past' });
  expect(listMyAppointments).toHaveBeenCalledTimes(1);
  expect(listMyAppointments).toHaveBeenCalledWith('past');
  expect(s.ids(/^my-appointment-/)).toEqual(['my-appointment-5']);
});
