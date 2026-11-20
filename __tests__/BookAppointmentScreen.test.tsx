/**
 * @format
 */

import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as bookingApi from '../src/api/booking';
import type { DaySlots, PortalDoctor, SlotDto } from '../src/api/booking';
import { ApiError } from '../src/api/client';
import * as profileApi from '../src/api/profile';
import BookAppointmentScreen from '../src/screens/patient/BookAppointmentScreen';
import {
  buildReason,
  dayCaption,
  departmentsOf,
  nextOpdDates,
  toIsoDate,
  visitTypeFor,
} from '../src/screens/patient/bookingHelpers';

jest.mock('../src/api/booking', () => ({
  getFacilities: jest.fn(),
  getDoctors: jest.fn(),
  getSlots: jest.fn(),
  bookAppointment: jest.fn(),
}));
jest.mock('../src/api/profile', () => ({
  ...jest.requireActual('../src/api/profile'),
  getMyProfile: jest.fn(),
}));

const getMyProfile = profileApi.getMyProfile as jest.Mock;
const getFacilities = bookingApi.getFacilities as jest.Mock;
const getDoctors = bookingApi.getDoctors as jest.Mock;
const getSlots = bookingApi.getSlots as jest.Mock;
const bookAppointment = bookingApi.bookAppointment as jest.Mock;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Thursday 15 Oct 2026, 8:00 AM. */
const NOW = new Date(2026, 9, 15, 8, 0);

// --- API data ---------------------------------------------------------------

const ritu = {
  id: 58,
  patientCode: 'PT-10058',
  fullName: 'Ritu Sharma',
  dateOfBirth: '1992-03-14',
  gender: 'female' as const,
  age: 34,
  allergies: [],
  conditions: [],
};
const ME: profileApi.PatientMe = {
  user: {
    id: 31,
    role: 'patient',
    fullName: 'Ritu Sharma',
    phone: '+919876543210',
    email: 'ritu@gmail.com',
  },
  profiles: [ritu],
};
const SUNRISE = { id: 1, name: 'Sunrise Clinic', city: 'Pune', address: null };

const sessions = (weekdays: number[]) =>
  weekdays.map(weekday => ({
    weekday,
    weekdayLabel: '',
    startTime: '09:00',
    endTime: '10:00',
    slotMinutes: 15,
  }));
const doctor = (over: Partial<PortalDoctor>): PortalDoctor => ({
  id: 2,
  fullName: 'Dr. Sarah Johnson',
  departmentId: 1,
  departmentName: 'General Medicine',
  specialization: 'Internal Medicine',
  qualification: 'MBBS, MD',
  consultationFee: 500,
  availability: { status: 'available', label: 'In OPD' },
  opdDaysLabel: 'Mon–Sat',
  schedule: sessions([1, 2, 3, 4, 5, 6]),
  ...over,
});
const DOCTORS = [
  doctor({}),
  doctor({
    id: 4,
    fullName: 'Dr. Rajesh Mehta',
    specialization: null,
    consultationFee: 400,
    availability: { status: 'late', label: 'Late 15 min' },
    opdDaysLabel: 'Mon, Wed, Fri',
    schedule: sessions([1, 3, 5]),
  }),
  doctor({
    id: 6,
    fullName: 'Dr. Anita Rao',
    departmentId: 3,
    departmentName: 'Paediatrics',
    specialization: 'Paediatrics',
    consultationFee: 600,
    opdDaysLabel: 'Tue, Thu',
    schedule: sessions([2, 4]),
  }),
];

const TIMES = ['09:00', '09:15', '09:30', '09:45'];
const daySlots = (date: string, states: SlotDto['state'][]): DaySlots => ({
  date,
  hasOpd: true,
  sessions: sessions([0]),
  slots: states.map((state, i) => ({ time: TIMES[i], state, label: '' })),
});
/** Slots per "doctorId|date"; anything else is all open. */
let slotTable: Record<string, SlotDto['state'][]>;

beforeEach(() => {
  // Fake only Date; keep real timers so React and async code run normally.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  slotTable = { '2|2026-10-15': ['past', 'full', 'open', 'few'] };
  getMyProfile.mockReset().mockResolvedValue(ME);
  getFacilities.mockReset().mockResolvedValue([SUNRISE]);
  getDoctors.mockReset().mockResolvedValue(DOCTORS);
  getSlots
    .mockReset()
    .mockImplementation(async (doctorId: number, _f: number, date: string) =>
      daySlots(
        date,
        slotTable[`${doctorId}|${date}`] ?? ['open', 'open', 'open', 'open'],
      ),
    );
  bookAppointment.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderBooking() {
  const goBack = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <BookAppointmentScreen
          navigation={{ goBack, navigate: jest.fn() } as never}
          route={{ key: 'BookAppointment', name: 'BookAppointment' } as never}
        />
      </SafeAreaProvider>,
    );
  });
  const byId = (testID: string) => renderer.root.findAllByProps({ testID })[0];
  const textOf = (node: ReactTestRenderer.ReactTestInstance) =>
    node
      .findAllByType(Text)
      .map(t =>
        ([] as unknown[])
          .concat(t.props.children)
          .filter(c => typeof c === 'string' || typeof c === 'number')
          .join(''),
      )
      .join('\n');
  const textIn = (testID: string) => textOf(byId(testID));
  const allText = () => textOf(renderer.root);
  const summary = () => textIn('booking-summary');
  const press = (testID: string) =>
    ReactTestRenderer.act(async () => {
      await byId(testID).props.onPress();
    });
  const type = (testID: string, text: string) =>
    ReactTestRenderer.act(async () => {
      byId(testID).props.onChangeText(text);
    });
  return { goBack, byId, textIn, allText, summary, press, type };
}

test('loads profile, clinic, doctors and slots; picks the earliest free slot', async () => {
  const s = await renderBooking();
  expect(getDoctors).toHaveBeenCalledWith(1);
  // Dr. Johnson's next 5 OPD days (Mon–Sat) from Thu 15 Oct.
  expect(getSlots.mock.calls.map(c => c.slice(0, 3))).toEqual([
    [2, 1, '2026-10-15'],
    [2, 1, '2026-10-16'],
    [2, 1, '2026-10-17'],
    [2, 1, '2026-10-19'],
    [2, 1, '2026-10-20'],
  ]);

  expect(s.allText()).toContain('Sunrise Clinic · OPD visit');
  expect(s.textIn('dept-1')).toBe('General Medicine');
  expect(s.textIn('dept-3')).toBe('Paediatrics');
  expect(s.textIn('doctor-2')).toBe(
    'SJ\nDr. Sarah Johnson\nMBBS, MD · Internal Medicine\nMon–Sat · In OPD',
  );
  expect(s.textIn('doctor-4')).toBe(
    'RM\nDr. Rajesh Mehta\nMBBS, MD · General Medicine\nMon, Wed, Fri · Late 15 min',
  );
  expect(s.byId('doctor-6')).toBeUndefined(); // other department

  expect(s.textIn('date-0')).toBe('Today\n15\n2 left');
  expect(s.textIn('date-1')).toBe('Fri\n16\n4 left');
  expect(s.textIn('date-3')).toBe('Mon\n19\n4 left');
  expect(s.byId('slot-09:00').props.disabled).toBe(true); // past
  expect(s.byId('slot-09:15').props.disabled).toBe(true); // full
  expect(s.byId('slot-09:30').props.accessibilityState.selected).toBe(true);
  expect(s.summary()).toBe('Dr. Sarah Johnson · Today 15 · 09:30 AM');
  expect(s.allText()).toMatch(/09:30 AM\n₹500\n/); // fee next to the summary
  expect(s.textIn('booking-card')).toMatch(
    /Your booking\nDate\nToday 15\nTime\n09:30\nFee\n₹500/,
  );
});

test('a day that is over is "Closed", a booked-out day is "Full"', async () => {
  slotTable = {
    '2|2026-10-15': ['past', 'past', 'past', 'past'],
    '2|2026-10-16': ['full', 'past', 'full', 'full'],
  };
  const s = await renderBooking();
  expect(s.textIn('date-0')).toBe('Today\n15\nClosed');
  expect(s.textIn('date-1')).toBe('Fri\n16\nFull');
  expect(s.byId('date-0').props.disabled).toBe(true);
  expect(s.summary()).toMatch(/^Dr\. Sarah Johnson · Sat 17 · 09:00 AM/);
});

test('changing department or doctor loads that doctor’s days', async () => {
  const s = await renderBooking();
  getSlots.mockClear();
  await s.press('dept-3');
  expect(s.byId('doctor-6').props.accessibilityState.checked).toBe(true);
  // Dr. Rao works Tue & Thu.
  expect(getSlots.mock.calls.map(c => c[2])).toEqual([
    '2026-10-15',
    '2026-10-20',
    '2026-10-22',
    '2026-10-27',
    '2026-10-29',
  ]);
  expect(s.summary()).toBe('Dr. Anita Rao · Today 15 · 09:00 AM');
  expect(s.allText()).toMatch(/09:00 AM\n₹600\n/);

  await s.press('dept-1');
  await s.press('doctor-4');
  expect(s.textIn('date-0')).toBe('Fri\n16\n4 left');
  expect(s.summary()).toMatch(/^Dr\. Rajesh Mehta · Fri 16/);
});

test('needs a problem; then books with the right details (pending)', async () => {
  const alert = jest
    .spyOn(Alert, 'alert')
    .mockImplementation((_t, _m, buttons) => buttons?.[0]?.onPress?.());
  bookAppointment.mockResolvedValue({
    id: 900,
    appointmentCode: 'APT-900',
    opdDate: '2026-10-15',
    slotTime: '09:30',
    status: 'pending',
    statusLabel: 'Pending',
    token: null,
    doctor: { id: 2, fullName: 'Dr. Sarah Johnson', opdRoom: 'Room 103' },
    facility: { id: 1, name: 'Sunrise Clinic' },
  });
  const s = await renderBooking();

  await s.press('confirm-booking');
  expect(s.textIn('booking-error')).toBe(
    'Tell us briefly what the problem is.',
  );
  expect(bookAppointment).not.toHaveBeenCalled();

  await s.press('tag-Follow-up');
  await s.type('problem-input', 'Sugar review ');
  await s.press('confirm-booking');
  expect(bookAppointment).toHaveBeenCalledWith({
    patientId: 58,
    facilityId: 1,
    doctorId: 2,
    date: '2026-10-15',
    slotTime: '09:30',
    visitType: 'follow_up',
    reason: 'Follow-up — Sugar review',
    symptoms: ['Follow-up'],
  });
  expect(alert).toHaveBeenCalledWith(
    'Booking requested',
    expect.stringContaining('The clinic will confirm your booking'),
    expect.any(Array),
  );
  expect(s.goBack).toHaveBeenCalled();
});

test('when the server confirms straight away, the token is shown', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  bookAppointment.mockResolvedValue({
    id: 901,
    slotTime: '09:30',
    status: 'confirmed',
    token: { number: 15, label: 'A-15' },
    doctor: { id: 2, fullName: 'Dr. Sarah Johnson', opdRoom: 'Room 103' },
    facility: { id: 1, name: 'Sunrise Clinic' },
  });
  const s = await renderBooking();
  await s.press('tag-Fever');
  await s.press('confirm-booking');
  expect(alert.mock.lastCall?.[0]).toBe('Booking confirmed');
  expect(alert.mock.lastCall?.[1]).toMatch(
    /Dr\. Sarah Johnson · Today 15 · 09:30 AM\nYour token: A-15/,
  );
});

test('if the slot was just taken, it says so and refreshes that day', async () => {
  bookAppointment.mockRejectedValue(
    new ApiError('This slot was just booked', 409, 'SLOT_FULL'),
  );
  const s = await renderBooking();
  await s.press('tag-Fever');
  slotTable['2|2026-10-15'] = ['past', 'full', 'full', 'few'];
  getSlots.mockClear();
  await s.press('confirm-booking');
  expect(s.textIn('booking-error')).toBe('This slot was just booked');
  expect(getSlots).toHaveBeenCalledWith(2, 1, '2026-10-15');
  expect(s.byId('slot-09:30').props.disabled).toBe(true);
  expect(s.summary()).toMatch(/09:45 AM/);
});

test('family members and several clinics can be chosen', async () => {
  getMyProfile.mockResolvedValue({
    ...ME,
    profiles: [ritu, { ...ritu, id: 59, fullName: 'Aarav Sharma' }],
  });
  getFacilities.mockResolvedValue([
    SUNRISE,
    { id: 2, name: 'Lakeview Clinic', city: null, address: null },
  ]);
  bookAppointment.mockResolvedValue({
    slotTime: '09:30',
    token: null,
    doctor: { fullName: 'Dr. Sarah Johnson' },
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const s = await renderBooking();
  expect(s.textIn('patient-58')).toBe('Ritu Sharma');
  expect(s.byId('patient-58').props.accessibilityState.selected).toBe(true);
  expect(s.textIn('facility-2')).toBe('Lakeview Clinic');

  await s.press('facility-2');
  expect(getDoctors).toHaveBeenLastCalledWith(2);
  await s.press('facility-1');

  await s.press('patient-59');
  await s.press('tag-Fever');
  await s.press('confirm-booking');
  expect(bookAppointment.mock.calls[0][0]).toMatchObject({
    patientId: 59,
    facilityId: 1,
  });
});

test('load problems offer "Try again"; no profile means no booking', async () => {
  getMyProfile.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderBooking();
  expect(s.textIn('account-error')).toMatch(/Can't reach the server\./);
  expect(s.byId('confirm-booking')).toBeUndefined();
  await s.press('account-error-retry');
  expect(s.byId('slot-09:30')).toBeDefined();

  getMyProfile.mockResolvedValue({ ...ME, profiles: [] });
  const empty = await renderBooking();
  expect(empty.textIn('cannot-book')).toMatch(/no patient profile yet/);
});

describe('booking helpers', () => {
  test('next OPD days follow the weekly schedule', () => {
    const dates = nextOpdDates(sessions([1, 3]), new Date(2026, 9, 15), 3);
    expect(dates.map(toIsoDate)).toEqual([
      '2026-10-19',
      '2026-10-21',
      '2026-10-26',
    ]);
    expect(nextOpdDates([], new Date(2026, 9, 15))).toEqual([]);
  });

  test('captions, departments, reason and visit type', () => {
    expect(dayCaption(daySlots('d', ['open', 'few', 'full']))).toBe('2 left');
    expect(dayCaption(daySlots('d', ['full', 'past']))).toBe('Full');
    expect(dayCaption(daySlots('d', ['past', 'past']))).toBe('Closed');
    expect(departmentsOf(DOCTORS)).toEqual([
      { id: 1, name: 'General Medicine' },
      { id: 3, name: 'Paediatrics' },
    ]);
    expect(buildReason(['Fever', 'Cough & cold'], ' since 2 days ')).toBe(
      'Fever, Cough & cold — since 2 days',
    );
    expect(visitTypeFor(['Fever'])).toBe('new');
    expect(visitTypeFor(['Follow-up'])).toBe('follow_up');
  });
});
