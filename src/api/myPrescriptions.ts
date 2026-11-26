// Patient app: every prescription of my profiles (all visits, all clinics).
// Only finalised ones; a draft the doctor is still writing never shows.

import { apiRequest } from './client';
import type { PrescriptionItem } from './visits';

export type MyPrescription = {
  id: number;
  /** "RX-3502" */
  rxCode: string | null;
  /** Visit day, "YYYY-MM-DD". */
  date: string;
  finalizedAt: string | null;
  /** "A-12" */
  token: string | null;
  complaint: string | null;
  diagnosis: string | null;
  /** "YYYY-MM-DD" */
  followUpDate: string | null;
  patient: { id: number; patientCode: string; fullName: string };
  doctor: { id: number; fullName: string; departmentName: string | null };
  facility: { id: number; name: string };
  medicines: PrescriptionItem[];
  medicineCount: number;
};

export type MyPrescriptionDetail = MyPrescription & {
  advice: string | null;
  testsAdvised: string[];
  vitals: {
    temperatureF: number | null;
    bp: string | null;
    pulse: number | null;
    spo2: number | null;
    weightKg: number | null;
    hasFever: boolean;
  } | null;
  doctor: MyPrescription['doctor'] & {
    qualification: string | null;
    registrationNo: string | null;
    opdRoom: string | null;
  };
  facility: MyPrescription['facility'] & {
    address: string | null;
    city: string | null;
    phone: string | null;
  };
};

/** Prescriptions per page; a shorter page means there are no more. */
export const MY_PRESCRIPTIONS_PAGE = 20;

/** Newest visit first. `data` is the list (paging info is in `meta`). */
export const listMyPrescriptions = (page = 1) =>
  apiRequest<MyPrescription[]>(
    `/me/prescriptions?page=${page}&limit=${MY_PRESCRIPTIONS_PAGE}`,
  );

export const getMyPrescription = (id: number) =>
  apiRequest<MyPrescriptionDetail>(`/me/prescriptions/${id}`);
