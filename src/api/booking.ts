// Patient app booking: clinics → doctors → free slots → POST /me/appointments.

import { apiRequest } from './client';
import type { OpdSessionDto } from './profile';

export type Facility = {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
};

export type PortalDoctor = {
  id: number;
  fullName: string;
  departmentId: number | null;
  departmentName: string | null;
  specialization: string | null;
  qualification: string | null;
  consultationFee: number | null;
  availability: {
    /** available · on_break · late · off */
    status: string;
    label: string;
  };
  /** e.g. "Mon–Sat" */
  opdDaysLabel: string;
  schedule: OpdSessionDto[];
};

export type SlotDto = {
  /** "HH:mm", sent back as slotTime */
  time: string;
  state: 'open' | 'few' | 'full' | 'past';
  /** e.g. "2:30 PM" */
  label: string;
};

export type DaySlots = {
  /** "YYYY-MM-DD" */
  date: string;
  hasOpd: boolean;
  sessions: OpdSessionDto[];
  slots: SlotDto[];
};

export type VisitType = 'new' | 'follow_up' | 'check_up';

export type BookingInput = {
  /** Which of my patient profiles (GET /me). */
  patientId: number;
  facilityId: number;
  doctorId: number;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" from the slots */
  slotTime: string;
  visitType: VisitType;
  reason: string;
  symptoms: string[];
};

export type BookedAppointment = {
  id: number;
  appointmentCode: string;
  opdDate: string;
  slotTime: string;
  /** "pending" until the clinic confirms; then "confirmed" with a token. */
  status: string;
  statusLabel: string;
  token: { number: number; label: string } | null;
  doctor: { id: number; fullName: string; opdRoom: string | null };
  facility: { id: number; name: string };
};

/** `data` is the list itself (paging info is in the envelope's `meta`). */
export const getFacilities = () =>
  apiRequest<Facility[]>('/me/facilities?limit=50');

export const getDoctors = (facilityId: number) =>
  apiRequest<PortalDoctor[]>(`/me/facilities/${facilityId}/doctors`);

export const getSlots = (doctorId: number, facilityId: number, date: string) =>
  apiRequest<DaySlots>(
    `/me/doctors/${doctorId}/slots?date=${date}&facilityId=${facilityId}`,
  );

export const bookAppointment = (input: BookingInput) =>
  apiRequest<BookedAppointment>('/me/appointments', {
    method: 'POST',
    body: input,
  });
