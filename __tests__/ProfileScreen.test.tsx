/**
 * @format
 */

import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../src/api/client';
import * as profileApi from '../src/api/profile';
import { AuthContext } from '../src/auth/AuthContext';
import type { User } from '../src/auth/types';
import ProfileScreen from '../src/screens/common/ProfileScreen';
import {
  birthdayLabel,
  formatMobile,
  scheduleRows,
  toProfileDetails,
} from '../src/screens/common/profileDetails';

jest.mock('../src/api/profile', () => ({
  ...jest.requireActual('../src/api/profile'),
  getMyProfile: jest.fn(),
}));
const getMyProfile = profileApi.getMyProfile as jest.Mock;

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// Signed-in users (from the login response).
const DOCTOR: User = {
  id: '2',
  name: 'Dr. Sarah Johnson',
  email: 'sarah.johnson@swapinfotech.com',
  mobile: '9876506543',
  role: 'doctor',
};
const ASSISTANT: User = {
  id: '7',
  name: 'Neha Patil',
  email: 'neha.patil@swapinfotech.com',
  mobile: '9000003301',
  role: 'assistant',
};
const PATIENT: User = {
  id: '31',
  name: 'Ritu Sharma',
  email: 'ritu@gmail.com',
  mobile: '9876543210',
  role: 'patient',
};

// GET /auth/me responses.
const weekdays = (from: number, to: number, endTime = '13:00') =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    weekday: from + i,
    weekdayLabel: '',
    startTime: '09:00',
    endTime,
    slotMinutes: 15,
  }));
const DOCTOR_ME: profileApi.StaffMe = {
  id: 2,
  role: 'doctor',
  facility: { id: 1, name: 'Sunrise Clinic' },
  fullName: 'Dr. Sarah Johnson',
  email: 'sarah.johnson@swapinfotech.com',
  phone: '+919876506543',
  employeeId: 'EMP-1021',
  status: 'active',
  joiningDate: '2024-01-15',
  doctor: {
    departmentName: 'General Medicine',
    specialization: 'Internal Medicine',
    qualification: 'MBBS, MD (Medicine)',
    registrationNo: 'MMC-2011-48213',
    opdRoom: 'Room 103',
    tokenPrefix: 'A',
    consultMinutes: 15,
    consultationFee: 500,
    schedule: [...weekdays(1, 5), ...weekdays(6, 6, '12:00')],
  },
  assistant: null,
};
const ASSISTANT_ME: profileApi.StaffMe = {
  ...DOCTOR_ME,
  id: 7,
  role: 'assistant',
  fullName: 'Neha Patil',
  email: 'neha.patil@swapinfotech.com',
  phone: '+919000003301',
  employeeId: 'EMP-1030',
  doctor: null,
  assistant: {
    desk: 'Desk 1',
    doctors: [
      { id: 2, fullName: 'Dr. Sarah Johnson' },
      { id: 3, fullName: 'Dr. Rajesh Mehta' },
    ],
  },
};
const PATIENT_ME: profileApi.PatientMe = {
  user: {
    id: 31,
    role: 'patient',
    fullName: 'Ritu Sharma',
    phone: '+919876543210',
    email: 'ritu@gmail.com',
  },
  profiles: [
    {
      id: 59,
      patientCode: 'PT-10059',
      fullName: 'Aarav Sharma',
      dateOfBirth: '2018-06-02',
      gender: 'male',
      age: 8,
      allergies: [],
      conditions: [],
    },
    {
      id: 58,
      patientCode: 'PT-10058',
      fullName: 'Ritu Sharma',
      dateOfBirth: '1992-03-14',
      gender: 'female',
      age: 34,
      allergies: ['Penicillin', 'Dust'],
      conditions: ['Asthma'],
    },
  ],
};

beforeEach(() => {
  getMyProfile.mockReset();
});
afterEach(() => jest.restoreAllMocks());

async function renderProfile(
  user: User,
  options: { onBack?: () => void; onAddStaff?: () => void } = {},
) {
  const signOut = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <AuthContext.Provider
          value={{ user, signIn: jest.fn(), signUp: jest.fn(), signOut }}
        >
          <ProfileScreen {...options} />
        </AuthContext.Provider>
      </SafeAreaProvider>,
    );
  });
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
  const allText = () => textOf(renderer.root);
  const byId = (testID: string) => renderer.root.findAllByProps({ testID })[0];
  const section = (title: string) => textOf(byId(`section-${title}`));
  const press = (testID: string) =>
    ReactTestRenderer.act(async () => {
      byId(testID).props.onPress();
    });
  return { allText, byId, section, press, signOut };
}

test('loads the profile from GET /auth/me, showing the sign-in name meanwhile', async () => {
  let resolve!: (me: profileApi.MeResponse) => void;
  getMyProfile.mockReturnValue(new Promise(r => (resolve = r)));
  const s = await renderProfile(DOCTOR);
  expect(getMyProfile).toHaveBeenCalledTimes(1);
  expect(s.allText()).toMatch(/Dr\. Sarah Johnson\nDoctor\nLoading…/);
  expect(s.byId('profile-loading')).toBeDefined();

  await ReactTestRenderer.act(async () => resolve(DOCTOR_ME));
  expect(s.byId('profile-loading')).toBeUndefined();
  expect(s.allText()).toMatch(/Doctor\nGeneral Medicine · Room 103/);
});

test('doctor: work, OPD (fee + grouped schedule) and contact from the API', async () => {
  getMyProfile.mockResolvedValue(DOCTOR_ME);
  const s = await renderProfile(DOCTOR);
  expect(s.byId('back')).toBeUndefined();
  expect(s.section('Work')).toBe(
    [
      'Work',
      'Specialisation',
      'Internal Medicine',
      'Qualification',
      'MBBS, MD (Medicine)',
      'Registration no.',
      'MMC-2011-48213',
      'Employee ID',
      'EMP-1021',
    ].join('\n'),
  );
  expect(s.section('OPD')).toBe(
    [
      'OPD',
      'Clinic',
      'Sunrise Clinic',
      'Room',
      'Room 103',
      'Token prefix',
      'A',
      'Consultation fee',
      '₹500',
      'Mon–Fri',
      '09:00 AM – 01:00 PM · 15 min',
      'Sat',
      '09:00 AM – 12:00 PM · 15 min',
    ].join('\n'),
  );
  expect(s.section('Contact')).toBe(
    [
      'Contact',
      'Mobile',
      '+91 98765 06543',
      'Email',
      'sarah.johnson@swapinfotech.com',
    ].join('\n'),
  );
});

test('assistant: desk and assigned doctors from the API', async () => {
  getMyProfile.mockResolvedValue(ASSISTANT_ME);
  const s = await renderProfile(ASSISTANT, { onBack: jest.fn() });
  expect(s.allText()).toMatch(/Neha Patil\nAssistant\nFront desk · Desk 1/);
  expect(s.section('Work')).toBe(
    [
      'Work',
      'Employee ID',
      'EMP-1030',
      'Clinic',
      'Sunrise Clinic',
      'Desk',
      'Desk 1',
      'Doctors',
      'Dr. Sarah Johnson, Dr. Rajesh Mehta',
    ].join('\n'),
  );
  expect(s.allText()).not.toMatch(/Specialisation|Allergies/);
});

test('patient: own record, health in red, family members; back works', async () => {
  getMyProfile.mockResolvedValue(PATIENT_ME);
  const onBack = jest.fn();
  const s = await renderProfile(PATIENT, { onBack });
  expect(s.allText()).toMatch(/Ritu Sharma\nPatient\nPatient ID PT-10058/);
  expect(s.section('Personal')).toMatch(
    /Patient ID\nPT-10058\nDate of birth\n14 Mar 1992 · \d+ yrs\nGender\nFemale/,
  );
  expect(s.section('Health')).toBe(
    [
      'Health',
      'Allergies',
      'Penicillin, Dust',
      'Existing conditions',
      'Asthma',
    ].join('\n'),
  );
  expect(s.section('Family members')).toBe(
    ['Family members', 'Aarav Sharma', 'PT-10059 · 8 yrs'].join('\n'),
  );
  expect(s.allText()).not.toMatch(/Blood group|Emergency/);

  await s.press('back');
  expect(onBack).toHaveBeenCalled();
});

test('if the profile fails to load, it says why and can try again', async () => {
  getMyProfile.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  getMyProfile.mockResolvedValueOnce(DOCTOR_ME);
  const s = await renderProfile(DOCTOR);
  expect(s.byId('profile-error').props.children).toBe(
    "Can't reach the server.",
  );
  // Still usable: name from sign-in, settings and sign out.
  expect(s.allText()).toMatch(/Dr\. Sarah Johnson\nDoctor/);
  expect(s.byId('sign-out')).toBeDefined();

  await s.press('profile-retry');
  expect(s.byId('profile-error')).toBeUndefined();
  expect(s.section('Work')).toContain('MMC-2011-48213');
});

test('settings only has Change password; edit is a placeholder', async () => {
  getMyProfile.mockResolvedValue(DOCTOR_ME);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const s = await renderProfile(DOCTOR);
  expect(s.allText()).toMatch(/Settings\nChange password\nSign out/);
  expect(s.allText()).not.toMatch(
    /Notifications|Language|Help & support|Privacy & terms/,
  );
  await s.press('setting-password');
  expect(alert.mock.lastCall?.[0]).toBe('Change password');
  await s.press('edit-profile');
  expect(alert.mock.lastCall?.[0]).toBe('Edit profile');
});

test('doctors get "Add doctor or assistant"; others do not', async () => {
  getMyProfile.mockResolvedValue(DOCTOR_ME);
  const onAddStaff = jest.fn();
  const doctor = await renderProfile(DOCTOR, { onAddStaff });
  expect(doctor.allText()).toMatch(/Clinic team\nAdd doctor or assistant/);
  await doctor.press('add-staff');
  expect(onAddStaff).toHaveBeenCalled();

  getMyProfile.mockResolvedValue(ASSISTANT_ME);
  const assistant = await renderProfile(ASSISTANT);
  expect(assistant.byId('add-staff')).toBeUndefined();
});

test('sign out asks first', async () => {
  getMyProfile.mockResolvedValue(ASSISTANT_ME);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { press, signOut } = await renderProfile(ASSISTANT);
  await press('sign-out');
  expect(signOut).not.toHaveBeenCalled();
  const [title, , buttons] = alert.mock.lastCall!;
  expect(title).toBe('Sign out?');
  await ReactTestRenderer.act(async () => {
    buttons?.[1].onPress?.();
  });
  expect(signOut).toHaveBeenCalled();
});

describe('profile details', () => {
  test('schedule rows group neighbouring days with the same hours', () => {
    expect(scheduleRows([])).toEqual([{ label: 'OPD days', value: 'Not set' }]);
    const rows = scheduleRows([
      ...weekdays(1, 3),
      ...weekdays(5, 5),
      // Two sessions on Saturday
      {
        weekday: 6,
        weekdayLabel: '',
        startTime: '17:00',
        endTime: '19:00',
        slotMinutes: 20,
      },
      ...weekdays(6, 6),
    ]);
    expect(rows).toEqual([
      { label: 'Mon–Wed', value: '09:00 AM – 01:00 PM · 15 min' },
      { label: 'Fri', value: '09:00 AM – 01:00 PM · 15 min' },
      {
        label: 'Sat',
        value: '09:00 AM – 01:00 PM · 15 min, 05:00 PM – 07:00 PM · 20 min',
      },
    ]);
  });

  test('dates, mobile numbers and a patient without a profile yet', () => {
    expect(birthdayLabel('1992-03-14', new Date(2026, 10, 18))).toBe(
      '14 Mar 1992 · 34 yrs',
    );
    expect(birthdayLabel('not a date', new Date())).toBe('not a date');
    expect(formatMobile('+919876506543')).toBe('+91 98765 06543');
    expect(formatMobile(null)).toBe('—');

    const details = toProfileDetails({ ...PATIENT_ME, profiles: [] });
    expect(details.headline).toBe('No patient profile yet');
    expect(details.sections.map(s => s.title)).toEqual(['Contact']);
  });
});
