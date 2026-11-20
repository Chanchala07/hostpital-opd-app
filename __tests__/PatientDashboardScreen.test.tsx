/**
 * @format
 */

import React from 'react';
import { AuthContext } from '../src/auth/AuthContext';
import * as myApi from '../src/api/myAppointments';
import PatientDashboardScreen from '../src/screens/patient/PatientDashboardScreen';
import { NOW, myAppointment, myDetail } from '../test-utils/fixtures';
import { mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/myAppointments', () => ({
  listMyAppointments: jest.fn(),
  getMyAppointment: jest.fn(),
}));

const api = myApi as unknown as Record<string, jest.Mock>;

const patient = {
  id: '9',
  name: 'Priya Nair',
  email: 'priya.nair@mail.com',
  mobile: '9876543210',
  role: 'patient' as const,
};

const later = myAppointment(30, {
  opdDate: '2026-11-20',
  slotLabel: '11:30 AM',
  token: { number: 4, label: 'A-04' },
});
const evenLater = myAppointment(31, { opdDate: '2026-11-27' });

beforeEach(() => {
  pinDate(NOW);
  api.listMyAppointments
    .mockReset()
    .mockResolvedValue([myAppointment(13), later, evenLater]);
  api.getMyAppointment.mockReset().mockResolvedValue(myDetail(13));
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderHome() {
  const navigate = jest.fn();
  const s = await mount(
    <AuthContext.Provider
      value={{ user: patient, signIn: jest.fn(), signOut: jest.fn() }}
    >
      <PatientDashboardScreen
        navigation={{ navigate, addListener: () => () => {} } as never}
        route={{ key: 'Home', name: 'Home' } as never}
      />
    </AuthContext.Provider>,
  );
  return { ...s, navigate };
}

test("today's visit is live: token, estimated time and people ahead", async () => {
  const s = await renderHome();
  expect(api.getMyAppointment).toHaveBeenCalledWith(13);
  expect(s.textIn('visit-token')).toBe('A-13');
  expect(s.textIn('visit-eta')).toBe('10:50 AM');
  expect(s.allText()).toContain('2 patients ahead');
  expect(s.allText()).toContain('Dr. Sarah Johnson · Room 103');
});

test('upcoming lists the next visits (not today’s) and "See all" opens them', async () => {
  const s = await renderHome();
  expect(s.ids(/^my-appointment-/)).toEqual([
    'my-appointment-30',
    'my-appointment-31',
  ]);
  expect(s.textIn('my-appointment-30')).toContain('Token A-04');
  await s.press('see-all-appointments');
  expect(s.navigate).toHaveBeenCalledWith('MyAppointments');
  await s.press('my-appointment-30');
  expect(s.navigate).toHaveBeenCalledWith('TokenStatus', { appointmentId: 30 });
});

test('nothing upcoming: "See all" stays, and "Past visits" opens the history', async () => {
  api.listMyAppointments.mockResolvedValue([]);
  const s = await renderHome();
  expect(s.allText()).toContain('No upcoming visits.');
  expect(s.exists('see-all-appointments')).toBe(true);
  await s.press('see-past-appointments');
  expect(s.navigate).toHaveBeenCalledWith('MyAppointments', { tab: 'past' });
});

test('"Track" opens today’s token and the avatar opens the profile', async () => {
  const s = await renderHome();
  await s.press('track-token');
  expect(s.navigate).toHaveBeenCalledWith('TokenStatus', { appointmentId: 13 });
  await s.press('open-profile');
  expect(s.navigate).toHaveBeenCalledWith('Profile');
});

test('"Your turn is next" on the home card', async () => {
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
  const s = await renderHome();
  expect(s.allText()).toMatch(
    /Please be ready\nYour turn is next\nGo to Room 103/,
  );
});

test('no visit today: offers to book; the rest still shows', async () => {
  api.listMyAppointments.mockResolvedValue([later]);
  const s = await renderHome();
  expect(api.getMyAppointment).not.toHaveBeenCalled();
  expect(s.allText()).toContain('No visit today');
  expect(s.ids(/^my-appointment-/)).toEqual(['my-appointment-30']);
  // Sample sections without an API yet.
  const text = s.allText();
  expect(text).toContain('Fluticasone nasal spray');
  expect(text).toContain('Viral fever');
  expect(text).toContain('Penicillin');
});

test('load failure offers "Try again"', async () => {
  const { ApiError } = jest.requireActual('../src/api/client');
  api.listMyAppointments.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderHome();
  expect(s.textIn('visit-error')).toContain("Can't reach the server.");
  await s.press('visit-retry');
  expect(s.textIn('visit-token')).toBe('A-13');
});

test('"Mark taken" moves to the next medicine, then shows all done', async () => {
  const s = await renderHome();
  await s.press('mark-taken');
  expect(s.allText()).toContain('Cetirizine 10 mg');
  await s.press('mark-taken');
  expect(s.allText()).toContain('All done for today');
});
