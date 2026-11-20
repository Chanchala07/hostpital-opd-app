/**
 * @format
 */

import React from 'react';
import { Alert, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiError } from '../src/api/client';
import * as patientsApi from '../src/api/patients';
import type { AddedPatient } from '../src/api/patients';
import * as profileApi from '../src/api/profile';
import AddPatientScreen from '../src/screens/common/AddPatientScreen';
import {
  ageLabel,
  clearDraft,
  dobToIso,
  formatDobInput,
  loadDraft,
  maskMobile,
  toggleExclusive,
} from '../src/screens/common/addPatientForm';
import { ASSISTANT_ME, DOCTOR_ME } from '../test-utils/fixtures';

jest.mock('../src/api/patients', () => ({ addPatient: jest.fn() }));
jest.mock('../src/api/profile', () => ({
  ...jest.requireActual('../src/api/profile'),
  getMyProfile: jest.fn(),
}));

const addPatient = patientsApi.addPatient as jest.Mock;
const getMyProfile = profileApi.getMyProfile as jest.Mock;

const SAVED: AddedPatient = {
  patient: {
    id: 41,
    patientCode: 'PT-21075',
    fullName: 'Rahul Kapoor',
    ageGender: '38 M',
  },
  linkedExisting: false,
  appointment: {
    id: 120,
    token: { number: 16, label: 'A-16' },
    status: 'checked_in',
    statusLabel: 'Waiting',
    doctor: { id: 2, fullName: 'Dr. Sarah Johnson', opdRoom: 'Room 103' },
  },
};

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Tuesday 17 Nov 2026, 10:30 AM. */
const NOW = new Date(2026, 10, 17, 10, 30);

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
  clearDraft();
  getMyProfile.mockReset().mockResolvedValue(DOCTOR_ME);
  addPatient.mockReset().mockResolvedValue({ data: SAVED, message: 'ok' });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderAddPatient() {
  const onClose = jest.fn();
  const onSaved = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={metrics}>
        <AddPatientScreen onClose={onClose} onSaved={onSaved} />
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
  const exists = (testID: string) =>
    renderer.root.findAllByProps({ testID }).length > 0;
  const press = (testID: string) =>
    ReactTestRenderer.act(async () => {
      byId(testID).props.onPress();
    });
  const type = (testID: string, text: string) =>
    ReactTestRenderer.act(async () => {
      byId(testID).props.onChangeText(text);
    });
  const valueOf = (testID: string) => byId(testID).props.value;
  return { onClose, onSaved, allText, byId, exists, press, type, valueOf };
}

type Screen = Awaited<ReturnType<typeof renderAddPatient>>;

async function fillPersonal(s: Screen) {
  await s.type('full-name', 'Rahul Kapoor');
  await s.type('dob', '10031988');
  await s.press('gender-male');
  await s.type('mobile', '98123 45455');
}

describe('form helpers', () => {
  test('date of birth is formatted as it is typed', () => {
    expect(formatDobInput('1')).toBe('1');
    expect(formatDobInput('150')).toBe('15/0');
    expect(formatDobInput('15081987')).toBe('15/08/1987');
    expect(formatDobInput('15/08/19871')).toBe('15/08/1987');
  });

  test('age, masked mobile and "none" options', () => {
    expect(ageLabel('10/03/1988', NOW)).toBe('38 yrs');
    expect(ageLabel('17/11/2025', NOW)).toBe('1 yr');
    expect(ageLabel('01/05/2026', NOW)).toBe('6 mo');
    expect(ageLabel('31/02/2000', NOW)).toBeNull();
    expect(ageLabel('01/01/2030', NOW)).toBeNull();

    expect(maskMobile('9812345455')).toBe('+91 98••• ••455');
    expect(dobToIso('10/03/1988')).toBe('1988-03-10');

    expect(toggleExclusive(['Dust'], 'None known', 'None known')).toEqual([
      'None known',
    ]);
    expect(toggleExclusive(['None known'], 'Dust', 'None known')).toEqual([
      'Dust',
    ]);
    expect(toggleExclusive(['Dust', 'Aspirin'], 'Dust', 'None known')).toEqual([
      'Aspirin',
    ]);
  });
});

test('step 1 asks only for personal and contact details', async () => {
  const s = await renderAddPatient();
  expect(s.allText()).toContain('1 · Personal details');
  expect(s.allText()).toContain('Next: Medical info');
  for (const removed of [
    'blood-B+',
    'address',
    'city',
    'pin',
    'emergency-name',
    'relation',
    'emergency-phone',
  ]) {
    expect(s.exists(removed)).toBe(false);
  }
  expect(s.allText()).not.toContain('Blood group');
  expect(s.allText()).not.toContain('Emergency contact');

  await s.press('next');
  expect(s.byId('error-fullName').props.children).toBe(
    "Enter the patient's full name.",
  );
  expect(s.exists('error-dob')).toBe(true);
  expect(s.exists('error-gender')).toBe(true);
  expect(s.exists('error-mobile')).toBe(true);
  expect(s.exists('reason')).toBe(false); // still on step 1

  await fillPersonal(s);
  expect(s.valueOf('dob')).toBe('10/03/1988');
  expect(s.valueOf('mobile')).toBe('9812345455');
  expect(s.byId('age').props.children).toBe('38 yrs');
  // Errors clear as soon as the fields are fixed.
  expect(s.exists('error-fullName')).toBe(false);

  await s.type('email', 'rahul@mail');
  await s.press('next');
  expect(s.byId('error-email').props.children).toBe('Check the email address.');
  await s.type('email', 'rahul@mail.com');

  await s.press('next');
  expect(s.exists('reason')).toBe(true);
  expect(s.allText()).toContain('✓ Personal details');
  expect(s.byId('summary').props.children).toBe(
    '38 yrs · Male · +91 98••• ••455',
  );

  await s.press('edit-personal');
  expect(s.valueOf('full-name')).toBe('Rahul Kapoor');
});

test('step 2 records reason, allergies and conditions, then saves', async () => {
  const s = await renderAddPatient();
  await fillPersonal(s);
  await s.press('next');
  // A doctor's patients join their own queue: nothing to pick.
  expect(s.exists('doctor-2')).toBe(false);

  for (const removed of ['height', 'bp', 'add-medicine', 'smoking-no']) {
    expect(s.exists(removed)).toBe(false);
  }
  expect(s.allText()).not.toContain("Today's vitals");
  expect(s.allText()).not.toContain('Current medications');
  expect(s.allText()).not.toContain('History & lifestyle');

  // Reason is required.
  await s.press('save-patient');
  expect(s.exists('error-reason')).toBe(true);
  expect(addPatient).not.toHaveBeenCalled();
  await s.type('reason', 'Fever and headache since 2 days');

  await s.press('allergy-Penicillin');
  await s.press('other-allergy');
  await s.type('other-allergy-input', 'ibuprofen');
  await s.press('add-allergy');
  expect(s.exists('allergy-ibuprofen')).toBe(true);
  await s.press('condition-Hypertension');

  await s.press('save-patient');
  expect(addPatient).toHaveBeenCalledWith({
    fullName: 'Rahul Kapoor',
    dateOfBirth: '1988-03-10',
    gender: 'male',
    phone: '9812345455',
    allergies: ['Penicillin', 'ibuprofen'],
    conditions: ['Hypertension'],
    addToQueue: {
      doctorId: 2,
      reason: 'Fever and headache since 2 days',
      checkIn: true,
    },
  });
  expect(s.onSaved).toHaveBeenCalledWith(SAVED);
});

test('the desk picks which doctor’s queue; "none" chips send empty lists', async () => {
  getMyProfile.mockResolvedValue(ASSISTANT_ME);
  const s = await renderAddPatient();
  await fillPersonal(s);
  await s.press('next');
  expect(s.allText()).toContain('Dr. Johnson');
  expect(s.allText()).toContain('Dr. Mehta');
  expect(s.byId('doctor-2').props.selected).toBe(true);

  await s.press('doctor-3');
  expect(s.byId('doctor-3').props.selected).toBe(true);
  expect(s.byId('doctor-2').props.selected).toBe(false);
  await s.type('reason', 'Back pain');
  await s.press('allergy-None known');
  await s.press('condition-None');
  await s.press('save-patient');
  expect(addPatient).toHaveBeenCalledWith(
    expect.objectContaining({
      allergies: [],
      conditions: [],
      addToQueue: { doctorId: 3, reason: 'Back pain', checkIn: true },
    }),
  );
});

test('a patient already registered here is reported, not duplicated', async () => {
  addPatient.mockRejectedValue(
    new ApiError(
      'Rahul Kapoor is already registered as PT-20418',
      409,
      'PATIENT_DUPLICATE',
    ),
  );
  const s = await renderAddPatient();
  await fillPersonal(s);
  await s.press('next');
  await s.type('reason', 'Fever');
  await s.press('save-patient');
  expect(s.allText()).toContain(
    'Rahul Kapoor is already registered as PT-20418',
  );
  expect(s.onSaved).not.toHaveBeenCalled();
  expect(loadDraft()).toBeNull(); // nothing was saved as a draft either
  expect(s.byId('save-patient').props.accessibilityState.busy).toBe(false);
});

test('closing asks before throwing away entered details', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const clean = await renderAddPatient();
  await clean.press('close');
  expect(clean.onClose).toHaveBeenCalled();
  expect(alert).not.toHaveBeenCalled();

  const s = await renderAddPatient();
  await s.type('full-name', 'Rahul Kapoor');
  await s.press('cancel');
  expect(s.onClose).not.toHaveBeenCalled();
  expect(alert.mock.calls[0][0]).toBe('Discard this patient?');
  const buttons = alert.mock.calls[0][2] ?? [];
  expect(buttons.map(b => b.text)).toEqual([
    'Keep editing',
    'Save draft',
    'Discard',
  ]);
  await ReactTestRenderer.act(async () => {
    buttons[2].onPress?.();
  });
  expect(s.onClose).toHaveBeenCalled();
  expect(loadDraft()).toBeNull();
});

test('a saved draft is restored next time, and can be dropped', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const first = await renderAddPatient();
  expect(first.byId('save-draft').props.disabled).toBe(true);
  await first.type('full-name', 'Rahul Kapoor');
  await first.type('mobile', '9812345455');
  await first.press('save-draft');
  expect(first.onClose).toHaveBeenCalled();
  expect(loadDraft()?.fullName).toBe('Rahul Kapoor');

  const second = await renderAddPatient();
  expect(second.allText()).toContain('Continuing your saved draft');
  expect(second.valueOf('full-name')).toBe('Rahul Kapoor');
  // Nothing changed since the draft, so closing doesn't ask.
  await second.press('close');
  expect(second.onClose).toHaveBeenCalled();

  const third = await renderAddPatient();
  await third.press('start-over');
  expect(third.valueOf('full-name')).toBe('');
  expect(third.allText()).not.toContain('Continuing your saved draft');
  expect(loadDraft()).toBeNull();
});
