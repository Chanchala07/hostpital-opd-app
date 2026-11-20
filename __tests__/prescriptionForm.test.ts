/**
 * @format
 */

import {
  doseLabel,
  emptyMedicineForm,
  formatFrequency,
  fromInput,
  medicineTitle,
  parseFrequency,
  scheduleText,
  toInput,
  validateMedicine,
} from '../src/screens/doctor/prescriptionForm';

const PARACETAMOL = {
  medicineName: 'Paracetamol',
  form: 'Tablet',
  strength: '650 mg',
  frequency: '1-0-1',
  durationDays: 5,
  timing: 'After food',
  instructions: null,
};

test('doses read and write in the server’s "1-0-1" format', () => {
  expect(parseFrequency('1-0-1')).toEqual([1, 0, 1]);
  expect(parseFrequency('0.5-0-1')).toEqual([0.5, 0, 1]);
  expect(parseFrequency('SOS')).toEqual([0, 0, 0]);
  expect(formatFrequency([0.5, 0, 2])).toBe('0.5-0-2');
  expect([0, 0.5, 1, 1.5, 2].map(doseLabel)).toEqual([
    '0',
    '½',
    '1',
    '1½',
    '2',
  ]);
});

test('a new medicine needs a name, a dose and 1–365 days', () => {
  expect(validateMedicine(emptyMedicineForm())).toEqual({
    medicineName: 'Enter the medicine name.',
    doses: 'Choose when to take it.',
    durationDays: 'Enter the number of days (1–365).',
  });
  const form = {
    ...emptyMedicineForm(),
    medicineName: ' Cetirizine ',
    doses: [0, 0, 1] as [number, number, number],
    durationDays: '400',
  };
  expect(validateMedicine(form)).toEqual({
    durationDays: 'Enter the number of days (1–365).',
  });
  expect(validateMedicine({ ...form, durationDays: '7' })).toEqual({});
});

test('the form becomes the request, blanks as null', () => {
  expect(
    toInput({
      ...emptyMedicineForm(),
      medicineName: ' Cetirizine ',
      strength: ' ',
      doses: [0, 0, 1],
      durationDays: '7',
      instructions: '  ',
    }),
  ).toEqual({
    medicineName: 'Cetirizine',
    form: null,
    strength: null,
    frequency: '0-0-1',
    durationDays: 7,
    timing: null,
    instructions: null,
  });
  // A saved medicine opens for editing as it was.
  expect(toInput(fromInput(PARACETAMOL))).toEqual(PARACETAMOL);
});

test('how a medicine reads in the list', () => {
  expect(medicineTitle(PARACETAMOL)).toBe('Paracetamol 650 mg');
  expect(scheduleText(PARACETAMOL)).toBe(
    '1-0-1 · Morning, night · 5 days · After food',
  );
  expect(
    scheduleText({
      ...PARACETAMOL,
      frequency: '0.5-1-2',
      durationDays: 1,
      timing: null,
    }),
  ).toBe('0.5-1-2 · ½ morning, afternoon, 2 night · 1 day');
});
