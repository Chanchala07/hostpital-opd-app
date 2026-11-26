/**
 * @format
 */

import {
  isOngoing,
  lastDoseDay,
  longDate,
  medicinesPreview,
  visitTitle,
} from '../src/screens/patient/myPrescriptionHelpers';
import { CETIRIZINE, myRx, PARACETAMOL } from '../test-utils/prescriptions';

test('the course lasts from the visit day through its longest medicine', () => {
  // Visit 16 Nov; Paracetamol 5 days (16–20 Nov), Cetirizine 3 days.
  const rx = myRx({ medicines: [PARACETAMOL, CETIRIZINE] });
  expect(lastDoseDay(rx)).toEqual(new Date(2026, 10, 20));
  expect(isOngoing(rx, new Date(2026, 10, 20, 21, 0))).toBe(true);
  expect(isOngoing(rx, new Date(2026, 10, 21, 0, 5))).toBe(false);
  expect(lastDoseDay(myRx({ medicines: [] }))).toBeNull();
  expect(isOngoing(myRx({ medicines: [] }), new Date(2026, 10, 16))).toBe(
    false,
  );
});

test('how a prescription reads in the list', () => {
  expect(longDate('2026-08-12')).toBe('12 Aug 2026');
  expect(medicinesPreview(myRx())).toBe(
    'Paracetamol 650 mg, Cetirizine 10 mg +1 more',
  );
  expect(medicinesPreview(myRx({ medicines: [CETIRIZINE] }))).toBe(
    'Cetirizine 10 mg',
  );
  expect(medicinesPreview(myRx({ medicines: [] }))).toBe('No medicines');
  expect(visitTitle({ diagnosis: 'Viral fever', complaint: 'Fever' })).toBe(
    'Viral fever',
  );
  expect(visitTitle({ diagnosis: null, complaint: 'Fever' })).toBe('Fever');
  expect(visitTitle({ diagnosis: null, complaint: null })).toBe('Visit');
});
