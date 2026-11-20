// GET /auth/me: the signed-in person's profile. Staff and patients get
// different shapes (see isPatientMe).

import type { ApiRole } from './auth';
import { apiRequest } from './client';

export type OpdSessionDto = {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  weekdayLabel: string;
  /** "HH:mm" */
  startTime: string;
  endTime: string;
  slotMinutes: number;
};

export type StaffMe = {
  id: number;
  role: ApiRole;
  facility: { id: number; name: string } | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  employeeId: string | null;
  status: string;
  /** "YYYY-MM-DD" */
  joiningDate: string | null;
  doctor: {
    departmentName: string | null;
    specialization: string | null;
    qualification: string | null;
    registrationNo: string | null;
    opdRoom: string | null;
    tokenPrefix: string | null;
    consultMinutes: number | null;
    consultationFee: number | null;
    schedule: OpdSessionDto[];
  } | null;
  assistant: {
    desk: string | null;
    doctors: { id: number; fullName: string }[];
  } | null;
};

export type PatientProfileDto = {
  id: number;
  patientCode: string;
  fullName: string;
  /** "YYYY-MM-DD" */
  dateOfBirth: string;
  gender: 'female' | 'male' | 'other';
  age: number;
  allergies: string[];
  conditions: string[];
};

export type PatientMe = {
  user: {
    id: number;
    role: 'patient';
    fullName: string;
    phone: string | null;
    email: string | null;
  };
  /** The account holder and any family members on the same number. */
  profiles: PatientProfileDto[];
};

export type MeResponse = StaffMe | PatientMe;

export const isPatientMe = (me: MeResponse): me is PatientMe =>
  'profiles' in me;

export const getMyProfile = () => apiRequest<MeResponse>('/auth/me');
