// Staff: the clinic's patient registry (search, register a walk-in).

import { apiCall, apiRequest } from './client';
import type { AppointmentStatus } from './queue';

type Gender = 'female' | 'male' | 'other';

/** A registered patient, as GET /patients lists them. */
export type RegisteredPatient = {
  id: number;
  /** "PT-20418" */
  patientCode: string;
  fullName: string;
  age: number;
  gender: Gender;
  /** "34 M" */
  ageGender: string;
  phone: string | null;
  /** "YYYY-MM-DD" of the last completed visit here, or null. */
  lastVisitDate: string | null;
  visitCount: number;
};

/** Name, phone or PT code; the array is directly in `data`. */
export const searchPatients = (search: string, limit = 10) =>
  apiRequest<RegisteredPatient[]>(
    `/patients?search=${encodeURIComponent(search)}&limit=${limit}`,
  );

/** POST /patients body (only the fields the app collects). */
export type NewPatientRequest = {
  fullName: string;
  /** "YYYY-MM-DD" */
  dateOfBirth: string;
  gender: Gender;
  /** 10-digit mobile */
  phone: string;
  /** [] = none known */
  allergies: string[];
  conditions: string[];
  /** "Save & add to today's queue": walk-in appointment + token. */
  addToQueue?: {
    doctorId: number;
    reason: string;
    /** true = the patient is here, straight into the waiting list. */
    checkIn?: boolean;
  };
};

export type AddedPatient = {
  patient: {
    id: number;
    patientCode: string;
    fullName: string;
    ageGender: string;
  };
  /** Already registered at another clinic: linked here, not duplicated. */
  linkedExisting: boolean;
  appointment: {
    id: number;
    token: { number: number; label: string } | null;
    status: AppointmentStatus;
    statusLabel: string;
    doctor: { id: number; fullName: string; opdRoom: string | null };
  } | null;
};

/**
 * Registers a patient (and, with addToQueue, gives them today's token).
 * 409 PATIENT_DUPLICATE when they are already registered at this clinic.
 */
export const addPatient = (body: NewPatientRequest) =>
  apiCall<AddedPatient>('/patients', { method: 'POST', body });
