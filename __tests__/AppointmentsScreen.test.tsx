/**
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import * as appointmentsApi from '../src/api/appointments';
import type { DayAppointment } from '../src/api/appointments';
import * as profileApi from '../src/api/profile';
import AppointmentsScreen from '../src/screens/common/AppointmentsScreen';
import { ASSISTANT_ME, DOCTOR_ME, NOW, card } from '../test-utils/fixtures';
import { mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/appointments', () => ({
  listDayAppointments: jest.fn(),
  getAppointmentSummary: jest.fn(),
}));
jest.mock('../src/api/profile', () => ({
  ...jest.requireActual('../src/api/profile'),
  getMyProfile: jest.fn(),
}));

const listDay = appointmentsApi.listDayAppointments as jest.Mock;
const summary = appointmentsApi.getAppointmentSummary as jest.Mock;
const getMyProfile = profileApi.getMyProfile as jest.Mock;

function appt(...args: Parameters<typeof card>): DayAppointment {
  const c = card(...args);
  return {
    ...c,
    slotMinutes: 15,
    visitType: c.id % 2 ? 'follow_up' : 'new',
    visitTypeLabel: c.id % 2 ? 'Follow-up' : 'New',
    patient: {
      id: c.patient.id,
      patientCode: `PT-${19000 + c.id}`,
      fullName: c.patient.fullName,
      ageGender: c.patient.ageGender,
    },
    doctor: { id: 2, fullName: 'Dr. Sarah Johnson', opdRoom: 'Room 103' },
  };
}

const TODAY_LIST: DayAppointment[] = [
  appt(10, 'A-10', 'Meera Joshi', '09:45', 'completed'),
  appt(11, 'A-11', 'Rohit Kulkarni', '10:00', 'in_consultation'),
  appt(13, 'A-13', 'Priya Nair', '10:30', 'checked_in'),
  appt(15, 'A-15', 'Sunita Rao', '11:00', 'confirmed', {
    originalSlotTime: '10:00',
  }),
  appt(16, 'A-16', 'Farah Khan', '14:15', 'confirmed'),
  appt(17, 'A-17', 'Walk In', null, 'checked_in', { isOnline: false }),
  appt(18, null, 'Rakesh Gupta', '12:00', 'cancelled'),
  appt(19, null, 'Kiran Desai', '12:15', 'no_show'),
];

beforeEach(() => {
  pinDate(NOW);
  getMyProfile.mockReset().mockResolvedValue(DOCTOR_ME);
  listDay.mockReset().mockImplementation(async (date: string) => ({
    doctorId: 2,
    date,
    items: date === '2026-11-18' ? TODAY_LIST : [],
  }));
  summary.mockReset().mockResolvedValue({
    days: [
      { date: '2026-11-18', booked: 6 },
      { date: '2026-11-19', booked: 2 },
    ],
  });
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const renderAppointments = () => mount(<AppointmentsScreen />);
const names = (s: Awaited<ReturnType<typeof renderAppointments>>) =>
  s.ids(/^appointment-\d+$/).map(id => Number(id.split('-')[1]));

test("doctor: today's own appointments from the API, by time of day", async () => {
  const s = await renderAppointments();
  // A doctor asks for "mine" (no doctorId).
  expect(listDay).toHaveBeenCalledWith('2026-11-18', undefined);
  expect(summary).toHaveBeenCalledWith('2026-11-17', '2026-11-23', undefined);
  expect(s.exists('doctor-tab-2')).toBe(false);
  const text = s.allText();
  expect(text).toContain('November 2026 · Room 103');
  expect(text).toMatch(/Upcoming · 5\nDone · 1\nCancelled · 2/);
  expect(text).toMatch(/5\nBooked\n3\nChecked in\n2\nNot arrived/);
  expect(text).toMatch(/MORNING[\s\S]*AFTERNOON[\s\S]*WALK-INS/);
  expect(names(s)).toEqual([11, 13, 15, 16, 17]);
  expect(s.textIn('appointment-15')).toMatch(
    /^11:00\nAM\n15 min\nSunita Rao\nA-15\n34 M · PT-19015/,
  );
  expect(s.textIn('appointment-15')).toContain('Moved from 10:00 AM');
  expect(s.textIn('appointment-17')).toMatch(/^—\nWalk-in/);
  // Dots on days with bookings.
  expect(s.byId('day-1').props.accessibilityLabel).toBe('Thu 19, 2 booked');
  expect(s.byId('day-2').props.accessibilityLabel).toBe('Fri 20');
});

test('done and cancelled tabs; reschedule is still a placeholder', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const s = await renderAppointments();
  await s.press('reschedule-15');
  expect(alert).toHaveBeenCalledWith(
    'Reschedule · Sunita Rao',
    'This will be connected in a later step.',
  );
  await s.press('tab-done');
  expect(names(s)).toEqual([10]);
  await s.press('tab-cancelled');
  expect(names(s)).toEqual([18, 19]);
  expect(s.textIn('appointment-19')).toContain('No-show');
});

test('picking another day loads that day', async () => {
  const s = await renderAppointments();
  await s.press('day-1');
  expect(listDay).toHaveBeenLastCalledWith('2026-11-19', undefined);
  expect(s.allText()).toContain('No upcoming appointments on this day.');
});

test('assistant: switches between the doctors they work for', async () => {
  getMyProfile.mockResolvedValue(ASSISTANT_ME);
  const s = await renderAppointments();
  expect(listDay).toHaveBeenCalledWith('2026-11-18', 2);
  expect(s.exists('doctor-tab-2')).toBe(true);
  await s.press('doctor-tab-3');
  expect(listDay).toHaveBeenLastCalledWith('2026-11-18', 3);
  expect(summary).toHaveBeenLastCalledWith('2026-11-17', '2026-11-23', 3);
});

test('load failure offers "Try again"', async () => {
  const { ApiError } = jest.requireActual('../src/api/client');
  listDay.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderAppointments();
  expect(s.textIn('day-error')).toContain("Can't reach the server.");
  await s.press('day-error-retry');
  expect(names(s)).toEqual([11, 13, 15, 16, 17]);
});
