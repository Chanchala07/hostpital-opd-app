// A patient's prescriptions as GET /me/prescriptions returns them.
// "Today" in the tests is Wed, 18 Nov 2026 (fixtures.NOW).

import type {
  MyPrescription,
  MyPrescriptionDetail,
} from '../src/api/myPrescriptions';
import type { PrescriptionItem } from '../src/api/visits';

const medicine = (
  id: number,
  over: Partial<PrescriptionItem>,
): PrescriptionItem => ({
  id,
  medicineName: 'Paracetamol',
  form: 'Tablet',
  strength: '650 mg',
  displayName: 'Paracetamol 650 mg',
  frequency: '1-0-1',
  durationDays: 5,
  timing: 'After food',
  instructions: null,
  ...over,
});

export const PARACETAMOL = medicine(1, {});
export const CETIRIZINE = medicine(2, {
  medicineName: 'Cetirizine',
  strength: '10 mg',
  displayName: 'Cetirizine 10 mg',
  frequency: '0-0-1',
  durationDays: 3,
  timing: 'Bedtime',
  instructions: 'May cause drowsiness',
});
export const IBUPROFEN = medicine(3, {
  medicineName: 'Ibuprofen',
  strength: '400 mg',
  displayName: 'Ibuprofen 400 mg',
  frequency: '0.5-0-0.5',
  durationDays: 3,
  timing: null,
});

/** Two days ago, Viral fever: the medicines run till Fri, 20 Nov. */
export function myRx(over: Partial<MyPrescription> = {}): MyPrescription {
  const medicines = over.medicines ?? [PARACETAMOL, CETIRIZINE, IBUPROFEN];
  return {
    id: 31,
    rxCode: 'RX-3502',
    date: '2026-11-16',
    finalizedAt: '2026-11-16T05:10:00.000Z',
    token: 'A-12',
    complaint: 'Fever, body ache · 2 days',
    diagnosis: 'Viral fever',
    followUpDate: '2026-11-21',
    patient: { id: 111, patientCode: 'PT-20111', fullName: 'Amit Verma' },
    doctor: {
      id: 2,
      fullName: 'Dr. Sarah Johnson',
      departmentName: 'General Medicine',
    },
    facility: { id: 1, name: 'Sunrise Clinic, Kothrud' },
    medicineCount: medicines.length,
    ...over,
    medicines,
  };
}

export function myRxDetail(
  over: Partial<MyPrescriptionDetail> = {},
): MyPrescriptionDetail {
  const base = myRx(over);
  return {
    ...base,
    advice: 'Fluids, rest 3 days',
    testsAdvised: ['CBC'],
    vitals: {
      temperatureF: 100.8,
      bp: '118/78',
      pulse: 92,
      spo2: null,
      weightKg: 72,
      hasFever: true,
    },
    doctor: {
      ...base.doctor,
      qualification: 'MBBS, MD (Medicine)',
      registrationNo: 'MMC-2011-04521',
      opdRoom: 'Room 103',
    },
    facility: {
      ...base.facility,
      address: '12 Karve Road, Kothrud',
      city: 'Pune',
      phone: '020 2545 1234',
    },
    ...over,
  };
}
