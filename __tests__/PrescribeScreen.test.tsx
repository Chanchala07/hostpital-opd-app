/**
 * @format
 */

import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import * as queueApi from '../src/api/queue';
import * as visitsApi from '../src/api/visits';
import type { ConsultationVisit, MedicineInput } from '../src/api/visits';
import PrescribeScreen from '../src/screens/doctor/PrescribeScreen';
import { NOW } from '../test-utils/fixtures';
import { flush, mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/queue', () => ({ getVisitId: jest.fn() }));
jest.mock('../src/api/visits', () => ({
  getVisit: jest.fn(),
  savePrescription: jest.fn(),
}));

const getVisitId = queueApi.getVisitId as jest.Mock;
const getVisit = visitsApi.getVisit as jest.Mock;
const savePrescription = visitsApi.savePrescription as jest.Mock;

const PARACETAMOL: MedicineInput = {
  medicineName: 'Paracetamol',
  form: 'Tablet',
  strength: '650 mg',
  frequency: '1-0-1',
  durationDays: 5,
  timing: 'After food',
  instructions: null,
};

/** A-11 Rohit Kulkarni in consultation; Paracetamol already on the draft. */
function visit(over: Partial<ConsultationVisit> = {}): ConsultationVisit {
  return {
    id: 77,
    appointmentId: 11,
    status: 'in_progress',
    complaint: 'Fever, body ache · 2 days',
    diagnosis: null,
    token: 'A-11',
    patient: {
      id: 111,
      patientCode: 'PT-20111',
      fullName: 'Rohit Kulkarni',
      ageGender: '34 M',
      allergies: ['Penicillin'],
      conditions: ['Asthma'],
      currentMedicines: [{ name: 'Salbutamol inhaler', dose: null }],
    },
    vitals: {
      temperatureF: 101.2,
      bp: '118/78',
      pulse: 96,
      spo2: null,
      weightKg: 72,
      hasFever: true,
    },
    prescription: {
      id: 5,
      rxCode: null,
      status: 'draft',
      items: [{ ...PARACETAMOL, id: 1, displayName: 'Paracetamol 650 mg' }],
    },
    ...over,
  };
}

beforeEach(() => {
  pinDate(NOW);
  getVisitId.mockReset().mockResolvedValue(77);
  getVisit.mockReset().mockResolvedValue(visit());
  savePrescription.mockReset().mockResolvedValue(visit());
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderRx(params: { appointmentId: number; visitId?: number }) {
  const navigation = {
    goBack: jest.fn(),
    dispatch: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };
  const s = await mount(
    <PrescribeScreen
      navigation={navigation as never}
      route={{ key: 'Prescribe', name: 'Prescribe', params } as never}
    />,
  );
  return { ...s, navigation };
}

/** The items of the last PUT …/prescription. */
const lastSaved = () =>
  savePrescription.mock.calls[savePrescription.mock.calls.length - 1][1];

test('opens the visit: allergies, complaint, vitals and the saved draft', async () => {
  const s = await renderRx({ appointmentId: 11 });
  expect(getVisitId).toHaveBeenCalledWith(11); // no visit id after an app restart
  expect(getVisit).toHaveBeenCalledWith(77);
  expect(s.allText()).toContain('A-11 · Rohit Kulkarni · 34 M');
  expect(s.textIn('allergies')).toContain('Penicillin');
  const notes = s.textIn('patient-notes');
  expect(notes).toContain('Fever, body ache · 2 days');
  expect(notes).toContain('101.2 °F · BP 118/78 · Pulse 96 · 72 kg');
  expect(notes).toContain('Asthma');
  expect(notes).toContain('Salbutamol inhaler');
  expect(s.textIn('medicine-count')).toBe('1');
  expect(s.textIn('medicine-0')).toMatch(
    /Paracetamol 650 mg[\s\S]*Tablet[\s\S]*1-0-1 · Morning, night · 5 days · After food/,
  );
  expect(s.textIn('rx-done')).toBe('Done · 1 medicine');
});

test('adding a medicine checks the form, then saves the whole list', async () => {
  const s = await renderRx({ appointmentId: 11, visitId: 77 });
  expect(getVisitId).not.toHaveBeenCalled();

  await s.press('add-medicine');
  expect(s.allText()).toContain('Allergic to Penicillin');
  await s.press('medicine-save');
  expect(s.textIn('error-medicineName')).toBe('Enter the medicine name.');
  expect(s.textIn('error-doses')).toBe('Choose when to take it.');
  expect(s.textIn('error-durationDays')).toBe(
    'Enter the number of days (1–365).',
  );
  expect(savePrescription).not.toHaveBeenCalled();

  await s.type('medicine-name', 'Cetirizine');
  await s.type('medicine-strength', '10 mg');
  await s.press('form-Tablet');
  await s.press('freq-0-0-1');
  await s.press('days-7');
  await s.press('timing-Bedtime');
  await s.type('medicine-instructions', 'May cause drowsiness');
  await s.press('medicine-save');

  expect(savePrescription).toHaveBeenCalledWith(77, [
    PARACETAMOL,
    {
      medicineName: 'Cetirizine',
      form: 'Tablet',
      strength: '10 mg',
      frequency: '0-0-1',
      durationDays: 7,
      timing: 'Bedtime',
      instructions: 'May cause drowsiness',
    },
  ]);
  expect(s.textIn('medicine-1')).toMatch(
    /Cetirizine 10 mg[\s\S]*0-0-1 · Night · 7 days · Bedtime[\s\S]*May cause drowsiness/,
  );
  expect(s.textIn('save-status')).toBe('Saved');
  expect(s.textIn('rx-done')).toBe('Done · 2 medicines');
});

test('half doses with the steppers, and typed days', async () => {
  const s = await renderRx({ appointmentId: 11, visitId: 77 });
  await s.press('add-medicine');
  await s.type('medicine-name', 'Ibuprofen');
  await s.press('dose-morning-plus');
  expect(s.textIn('dose-morning')).toBe('½');
  await s.press('dose-night-plus');
  await s.press('dose-night-plus');
  await s.press('dose-night-plus');
  await s.press('dose-night-minus');
  expect(s.textIn('dose-night')).toBe('1');
  await s.type('medicine-days', '3 days'); // only digits are kept
  await s.press('medicine-save');
  expect(lastSaved()[1]).toMatchObject({
    medicineName: 'Ibuprofen',
    frequency: '0.5-0-1',
    durationDays: 3,
  });
});

test('editing and removing a medicine', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const s = await renderRx({ appointmentId: 11, visitId: 77 });

  await s.press('medicine-0');
  expect(s.byId('medicine-name').props.value).toBe('Paracetamol');
  await s.press('days-3');
  await s.press('medicine-save');
  expect(lastSaved()).toEqual([{ ...PARACETAMOL, durationDays: 3 }]);

  await s.press('remove-medicine-0');
  const buttons = alert.mock.calls[0][2] as AlertButton[];
  expect(alert.mock.calls[0][0]).toBe('Remove Paracetamol 650 mg?');
  await ReactTestRenderer.act(async () => {
    buttons.find(b => b.text === 'Remove')!.onPress!();
  });
  await flush();
  expect(lastSaved()).toEqual([]);
  expect(s.exists('no-medicines')).toBe(true);
});

test('a failed save says so, can be retried, and guards leaving', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { ApiError } = jest.requireActual('../src/api/client');
  savePrescription.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderRx({ appointmentId: 11, visitId: 77 });
  await s.press('add-medicine');
  await s.type('medicine-name', 'ORS');
  await s.press('freq-1-1-1');
  await s.press('days-3');
  await s.press('medicine-save');
  expect(s.textIn('save-status')).toBe('Not saved');
  expect(s.textIn('save-error')).toContain("Can't reach the server.");

  // Leaving now asks first.
  const beforeRemove = (
    s.navigation.addListener.mock.calls as unknown[][]
  ).find(c => c[0] === 'beforeRemove')![1] as (e: unknown) => void;
  const event = {
    preventDefault: jest.fn(),
    data: { action: { type: 'GO_BACK' } },
  };
  beforeRemove(event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith(
    'Prescription not saved',
    expect.any(String),
    expect.any(Array),
  );

  await s.press('save-retry');
  expect(savePrescription).toHaveBeenCalledTimes(2);
  expect(s.textIn('save-status')).toBe('Saved');
  const later = { preventDefault: jest.fn(), data: { action: {} } };
  beforeRemove(later);
  expect(later.preventDefault).not.toHaveBeenCalled();
});

test('"Done" waits for the save, then goes back', async () => {
  let finish!: () => void;
  savePrescription.mockReturnValueOnce(
    new Promise(resolve => {
      finish = () => resolve(visit());
    }),
  );
  const s = await renderRx({ appointmentId: 11, visitId: 77 });
  await s.press('add-medicine');
  await s.type('medicine-name', 'ORS');
  await s.press('freq-1-1-1');
  await s.press('days-3');
  await s.press('medicine-save');
  expect(s.textIn('save-status')).toBe('Saving…');

  await s.press('rx-done');
  expect(s.navigation.goBack).not.toHaveBeenCalled();
  await ReactTestRenderer.act(async () => finish());
  await flush();
  expect(s.navigation.goBack).toHaveBeenCalled();
});

test('a visit that is not in consultation can’t be prescribed', async () => {
  getVisitId.mockResolvedValue(null);
  let s = await renderRx({ appointmentId: 11 });
  expect(s.textIn('rx-error')).toContain('Start the consultation');

  getVisit.mockResolvedValue(visit({ status: 'completed' }));
  s = await renderRx({ appointmentId: 11, visitId: 77 });
  expect(s.textIn('rx-error')).toContain('already completed');
});

test('a first prescription starts empty', async () => {
  getVisit.mockResolvedValue(
    visit({
      prescription: null,
      vitals: null,
      patient: {
        ...visit().patient,
        allergies: [],
        conditions: [],
        currentMedicines: [],
      },
    }),
  );
  const s = await renderRx({ appointmentId: 11, visitId: 77 });
  expect(s.exists('no-medicines')).toBe(true);
  expect(s.exists('allergies')).toBe(false);
  expect(s.textIn('patient-notes')).toBe(
    'Complaint\nFever, body ache · 2 days',
  );
  expect(s.textIn('rx-done')).toBe('Done');
});
