/**
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import { AuthContext } from '../src/auth/AuthContext';
import * as queueApi from '../src/api/queue';
import DoctorDashboardScreen from '../src/screens/doctor/DoctorDashboardScreen';
import { NOW, johnsonQueue } from '../test-utils/fixtures';
import { mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/queue', () => ({
  getQueue: jest.fn(),
  callNext: jest.fn(),
  recall: jest.fn(),
  startConsultation: jest.fn(),
  getVisitId: jest.fn(),
  completeVisit: jest.fn(),
  setAvailability: jest.fn(),
}));

const api = queueApi as unknown as Record<string, jest.Mock>;

const doctor = {
  id: '2',
  name: 'Dr. Sarah Johnson',
  email: 'sarah.johnson@swapinfotech.com',
  mobile: '9876500002',
  role: 'doctor' as const,
};

/** A-13 (waiting) has been called in; nobody is in consultation. */
function calledQueue() {
  const q = johnsonQueue();
  const called = { ...q.waiting[0], status: 'called' as const };
  return {
    ...q,
    nowServing: { ...called, startedMinutesAgo: null },
    waiting: [],
    stats: { ...q.stats, waiting: 0 },
  };
}

/** Room free, A-13 waiting. */
function freeRoomQueue() {
  return { ...johnsonQueue(), nowServing: null };
}

beforeEach(() => {
  pinDate(NOW);
  for (const fn of Object.values(api)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
    }
  }
  api.getQueue.mockResolvedValue(johnsonQueue());
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
      value={{ user: doctor, signIn: jest.fn(), signOut: jest.fn() }}
    >
      <DoctorDashboardScreen
        navigation={{ navigate, addListener: () => () => {} } as never}
        route={{ key: 'Home', name: 'Home' } as never}
      />
    </AuthContext.Provider>,
  );
  return { ...s, navigate };
}

test("shows today's live queue: patient inside, stats and the line", async () => {
  const s = await renderHome();
  expect(api.getQueue).toHaveBeenCalledWith();
  const text = s.allText();
  expect(text).toContain('09:00 AM – 01:00 PM');
  expect(text).toContain('Room 103 · General Medicine');
  expect(s.textIn('room-token')).toBe('A-11');
  expect(text).toContain('Rohit Kulkarni');
  expect(text).toContain('Started 5 min ago');
  expect(text).toContain('Last visit: ');
  expect(text).toContain('Migraine on Wed, 12 Aug — Naproxen 250 mg');
  expect(text).toMatch(/Today\n6\nappointments/);
  expect(text).toMatch(/Not arrived\n3\n1 late/);
  expect(text).toContain('1 of 6 seen');
  expect(text).toContain('Expected to finish by 11:10 AM');
  // Up next: A-13 (arrived, next), A-14 (not arrived), A-15.
  expect(s.textIn('up-next-13')).toMatch(
    /A-13[\s\S]*est\. 10:40 AM[\s\S]*Next/,
  );
  expect(s.textIn('up-next-14')).toContain('Not arrived');
});

test('finishing a visit needs a diagnosis, then completes and calls next', async () => {
  api.getVisitId.mockResolvedValue(77);
  api.completeVisit.mockResolvedValue({
    data: { calledNext: null, callNextError: null },
    message: 'Consultation completed',
  });
  const s = await renderHome();
  // After an app restart the visit id isn't known yet: the screen looks it up.
  await s.press('prescribe');
  expect(s.navigate).toHaveBeenCalledWith('Prescribe', {
    appointmentId: 11,
    visitId: undefined,
  });

  await s.press('visit-complete');
  await s.press('complete-call-next');
  expect(s.textIn('diagnosis-error')).toBe('Enter a diagnosis.');
  expect(api.completeVisit).not.toHaveBeenCalled();

  await s.type('diagnosis-input', 'Tension headache');
  await s.press('complete-call-next');
  expect(api.getVisitId).toHaveBeenCalledWith(11);
  expect(api.completeVisit).toHaveBeenCalledWith(77, {
    diagnosis: 'Tension headache',
    callNext: true,
  });
  // Next patient already called: stays on the dashboard.
  expect(s.navigate).not.toHaveBeenCalledWith('VisitDone', expect.anything());
});

test('a called patient: Start opens the visit, and its id is used to finish', async () => {
  api.getQueue.mockResolvedValue(calledQueue());
  api.startConsultation.mockResolvedValue({
    data: { visitId: 91, appointment: {} },
    message: 'Consultation started',
  });
  api.completeVisit.mockResolvedValue({
    data: { calledNext: null, callNextError: null },
    message: 'Consultation completed',
  });
  const s = await renderHome();
  expect(s.allText()).toContain('CALLED IN');
  expect(s.exists('recall')).toBe(true);

  // After Start the server says A-13 is in consultation.
  api.getQueue.mockResolvedValue({
    ...calledQueue(),
    nowServing: {
      ...calledQueue().nowServing,
      status: 'in_consultation',
      startedMinutesAgo: 0,
    },
  });
  await s.press('start-consultation');
  expect(api.startConsultation).toHaveBeenCalledWith(13);
  expect(s.allText()).toContain('Started just now');

  // "Prescribe" opens the prescription for this visit.
  await s.press('prescribe');
  expect(s.navigate).toHaveBeenCalledWith('Prescribe', {
    appointmentId: 13,
    visitId: 91,
  });

  await s.press('visit-complete');
  await s.type('diagnosis-input', 'Bronchitis');
  await s.press('complete-only');
  expect(api.getVisitId).not.toHaveBeenCalled();
  expect(api.completeVisit).toHaveBeenCalledWith(91, {
    diagnosis: 'Bronchitis',
    callNext: false,
  });
  // "Complete" opens the "Visit completed" summary.
  expect(s.navigate).toHaveBeenCalledWith('VisitDone', { visitId: 91 });
});

test('room free: "Call next patient"; on break it is disabled', async () => {
  api.getQueue.mockResolvedValue(freeRoomQueue());
  api.callNext.mockResolvedValue({ data: {}, message: 'A-13 called' });
  api.setAvailability.mockResolvedValue({ data: null, message: 'OK' });
  const s = await renderHome();
  expect(s.allText()).toContain('Your room is free. 1 waiting.');
  await s.press('call-next');
  expect(api.callNext).toHaveBeenCalledWith();

  // The refetch after the toggle says the doctor is on break.
  api.getQueue.mockResolvedValue({
    ...freeRoomQueue(),
    doctor: {
      ...freeRoomQueue().doctor,
      availability: { status: 'on_break', label: 'On break' },
    },
  });
  await s.press('availability-toggle');
  expect(api.setAvailability).toHaveBeenCalledWith(2, 'on_break');
  expect(s.isDisabled('call-next')).toBe(true);
  expect(s.allText()).toContain("You're on break.");

  await s.press('availability-toggle');
  expect(api.setAvailability).toHaveBeenLastCalledWith(2, 'available');
});

test('"No one is waiting" when the server has nobody to call', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  api.getQueue.mockResolvedValue(freeRoomQueue());
  api.callNext.mockResolvedValue({ data: null, message: 'No one is waiting' });
  const s = await renderHome();
  await s.press('call-next');
  expect(alert).toHaveBeenCalledWith('No one is waiting', 'No one is waiting');
});
