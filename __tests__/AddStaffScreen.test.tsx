/**
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../src/api/client';
import * as staffApi from '../src/api/staff';
import AddStaffScreen from '../src/screens/doctor/AddStaffScreen';

jest.mock('../src/api/staff', () => ({
  getStaffFormOptions: jest.fn(),
  createStaff: jest.fn(),
}));

const getOptions = staffApi.getStaffFormOptions as jest.Mock;
const createStaff = staffApi.createStaff as jest.Mock;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const OPTIONS: staffApi.StaffFormOptions = {
  facility: { id: 1, name: 'Sunrise Clinic', facilityCode: 'FAC-001' },
  departments: [
    { id: 1, name: 'General Medicine' },
    { id: 3, name: 'Paediatrics' },
  ],
  desks: ['Desk 1', 'Desk 2', 'Desk 3'],
  doctors: [
    {
      id: 2,
      fullName: 'Dr. Sarah Johnson',
      departmentName: 'General Medicine',
      opdRoom: 'Room 103',
    },
    {
      id: 4,
      fullName: 'Dr. Rajesh Mehta',
      departmentName: 'General Medicine',
      opdRoom: 'Room 105',
    },
  ],
  suggestedEmployeeId: 'EMP-1108',
  suggestedTokenPrefix: 'C',
  defaultSchedule: {
    startTime: '09:00',
    endTime: '13:00',
    slotMinutes: 15,
    weekdays: [1, 2, 3, 4, 5],
  },
};

const CREATED = {
  staff: { id: 9, fullName: 'Dr. Meera Shah', role: 'doctor' },
  invite: { channels: ['sms', 'email'], expiresAt: '2026-11-20T10:00:00Z' },
};

beforeEach(() => {
  getOptions.mockReset().mockResolvedValue(OPTIONS);
  createStaff.mockReset().mockResolvedValue(CREATED);
});

async function renderScreen() {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <AddStaffScreen onClose={onClose} onSaved={onSaved} />
      </SafeAreaProvider>,
    );
  });
  const allText = () =>
    renderer.root
      .findAllByType(Text)
      .map(t =>
        ([] as unknown[])
          .concat(t.props.children)
          .filter(c => typeof c === 'string' || typeof c === 'number')
          .join(''),
      )
      .join('\n');
  const byId = (testID: string) => renderer.root.findAllByProps({ testID })[0];
  const exists = (testID: string) => byId(testID) !== undefined;
  const press = (testID: string) =>
    ReactTestRenderer.act(async () => {
      byId(testID).props.onPress();
    });
  const type = (testID: string, text: string) =>
    ReactTestRenderer.act(async () => {
      byId(testID).props.onChangeText(text);
    });
  const toggle = (testID: string, value: boolean) =>
    ReactTestRenderer.act(async () => {
      byId(testID).props.onValueChange(value);
    });
  /** Opens a dropdown and picks an option. */
  const pick = async (field: string, value: string | number) => {
    await press(field);
    await press(`option-${value}`);
  };
  const errorOf = (key: string) => byId(`error-${key}`)?.props.children;
  /** Screen-reader label of the element with this testID. */
  const a11y = (testID: string) =>
    renderer.root.findAll(
      n =>
        n.props.testID === testID &&
        typeof n.props.accessibilityLabel === 'string',
    )[0]?.props.accessibilityLabel;
  return {
    onClose,
    onSaved,
    allText,
    byId,
    exists,
    press,
    type,
    toggle,
    pick,
    errorOf,
    a11y,
  };
}

type Screen = Awaited<ReturnType<typeof renderScreen>>;

async function fillPerson(s: Screen, name: string) {
  await s.type('staff-name', name);
  await s.type('staff-phone', '98123 45678');
  await s.type('staff-email', 'Meera.Shah@Sunrise.example');
}

test('loads the facility options; doctor form with the default timetable', async () => {
  const s = await renderScreen();
  expect(s.allText()).toMatch(
    /Add staff member\nSunrise Clinic\nDoctor\nAssistant/,
  );
  expect(s.byId('token-prefix').props.value).toBe('C');
  expect(s.allText()).toMatch(
    /Clinic details[\s\S]*Department[\s\S]*OPD room[\s\S]*Token prefix[\s\S]*Fee \(₹\)/,
  );
  // Sun closed, Mon–Fri open 9 AM – 1 PM, 15 min slots, Sat closed.
  expect(s.byId('day-open-0').props.value).toBe(false);
  expect(s.byId('day-open-1').props.value).toBe(true);
  expect(s.byId('day-open-6').props.value).toBe(false);
  expect(s.a11y('start-1')).toBe('Start 09:00 AM');
  expect(s.a11y('end-1')).toBe('End 01:00 PM');
  expect(s.a11y('slot-1')).toBe('Slot 15 min');
  expect(s.exists('start-0')).toBe(false);
});

test('checks every doctor field before saving', async () => {
  const s = await renderScreen();
  await s.type('token-prefix', '');
  await s.press('submit-staff');
  expect(createStaff).not.toHaveBeenCalled();
  for (const key of [
    'fullName',
    'phone',
    'email',
    'specialization',
    'qualification',
    'registrationNo',
    'departmentId',
    'opdRoom',
    'tokenPrefix',
    'fee',
  ]) {
    expect(s.errorOf(key)).toBeTruthy();
  }

  await s.pick('end-1', '09:00');
  expect(s.errorOf('schedule-1')).toBe('End time must be after start time.');

  for (const day of [1, 2, 3, 4, 5]) {
    await s.toggle(`day-open-${day}`, false);
  }
  expect(s.byId('error-schedule').props.children).toBe(
    'Open at least one OPD day.',
  );
});

test('adds a doctor with clinic details and a Mon–Sat schedule', async () => {
  const s = await renderScreen();
  await fillPerson(s, 'Dr. Meera  Shah');
  await s.type('specialization', 'Paediatrics');
  await s.type('qualification', 'MBBS, MD (Paediatrics)');
  await s.type('registration-no', 'MMC-2015-77120');
  await s.pick('department', 3);
  await s.type('opd-room', 'Room 112');
  await s.type('token-prefix', 'pd1');
  expect(s.byId('token-prefix').props.value).toBe('PD');
  await s.type('fee', '₹ 500');

  // Mon: 20-minute slots, copied to every open day; then open Saturday mornings.
  await s.pick('slot-1', 20);
  await s.press('copy-monday');
  await s.toggle('day-open-6', true);
  await s.pick('end-6', '12:00');

  await s.press('submit-staff');
  expect(createStaff).toHaveBeenCalledWith({
    role: 'doctor',
    fullName: 'Dr. Meera Shah',
    phone: '9812345678',
    email: 'meera.shah@sunrise.example',
    doctor: {
      specialization: 'Paediatrics',
      qualification: 'MBBS, MD (Paediatrics)',
      registrationNo: 'MMC-2015-77120',
      departmentId: 3,
      opdRoom: 'Room 112',
      tokenPrefix: 'PD',
      consultationFee: 500,
      schedule: [1, 2, 3, 4, 5]
        .map(weekday => ({
          weekday,
          startTime: '09:00',
          endTime: '13:00',
          slotMinutes: 20,
        }))
        .concat({
          weekday: 6,
          startTime: '09:00',
          endTime: '12:00',
          slotMinutes: 15,
        }),
    },
  });
  expect(s.onSaved).toHaveBeenCalledWith(CREATED, 'doctor');
});

test('adds an assistant with a desk and assigned doctors', async () => {
  const s = await renderScreen();
  await s.press('role-assistant');
  expect(s.exists('specialization')).toBe(false);
  expect(s.exists('day-open-1')).toBe(false);
  expect(s.allText()).toMatch(
    /Desk[\s\S]*Assigned doctors[\s\S]*Dr\. Sarah Johnson\nGeneral Medicine · Room 103/,
  );

  await fillPerson(s, 'Pooja Rane');
  await s.press('submit-staff');
  expect(s.errorOf('desk')).toBe('Choose a desk.');
  expect(s.errorOf('doctorIds')).toBe('Assign at least one doctor.');

  await s.pick('desk', 'Desk 2');
  await s.press('assign-doctor-2');
  await s.press('assign-doctor-4');
  await s.press('assign-doctor-4'); // unticked again
  await s.press('submit-staff');
  expect(createStaff).toHaveBeenCalledWith({
    role: 'assistant',
    fullName: 'Pooja Rane',
    phone: '9812345678',
    email: 'meera.shah@sunrise.example',
    assistant: { desk: 'Desk 2', doctorIds: [2] },
  });
  expect(s.onSaved).toHaveBeenCalledWith(CREATED, 'assistant');
});

test('a taken email is shown on the email field', async () => {
  createStaff.mockRejectedValueOnce(
    new ApiError('This email is already in use', 409, 'EMAIL_TAKEN'),
  );
  const s = await renderScreen();
  await s.press('role-assistant');
  await fillPerson(s, 'Pooja Rane');
  await s.pick('desk', 'Desk 1');
  await s.press('assign-doctor-2');
  await s.press('submit-staff');
  expect(s.errorOf('email')).toBe('This email is already in use');
  expect(s.onSaved).not.toHaveBeenCalled();

  await s.type('staff-email', 'pooja.rane@sunrise.example');
  expect(s.errorOf('email')).toBeUndefined();
});

test('if the options fail to load, it offers to try again', async () => {
  getOptions.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderScreen();
  expect(s.allText()).toContain("Can't reach the server.");
  await s.press('retry');
  expect(s.byId('token-prefix').props.value).toBe('C');
  await s.press('back');
  expect(s.onClose).toHaveBeenCalled();
});
