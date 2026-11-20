// Staff: a doctor's appointments for a day (doctor's Schedule, desk's Bookings).

import { apiRequest } from './client';
import type { AppointmentStatus } from './queue';

export type DayAppointment = {
  id: number;
  appointmentCode: string;
  opdDate: string;
  /** "HH:mm"; null for a walk-in without a slot. */
  slotTime: string | null;
  slotLabel: string | null;
  slotMinutes: number;
  originalSlotTime: string | null;
  token: { number: number; label: string } | null;
  status: AppointmentStatus;
  statusLabel: string;
  visitType: 'new' | 'follow_up' | 'check_up';
  visitTypeLabel: string;
  isOnline: boolean;
  reason: string | null;
  patient: {
    id: number;
    patientCode: string;
    fullName: string;
    ageGender: string;
  };
  doctor: { id: number; fullName: string; opdRoom: string | null };
  checkedInAt: string | null;
};

export type DayAppointments = {
  doctorId: number;
  date: string;
  items: DayAppointment[];
};

export type DaySummary = {
  date: string;
  isToday: boolean;
  hasOpd: boolean;
  booked: number;
  checkedIn: number;
  completed: number;
  cancelled: number;
};

const doctorParam = (doctorId?: number) =>
  doctorId ? `&doctorId=${doctorId}` : '';

/** Every appointment of the day (any status); a doctor gets their own. */
export const listDayAppointments = (date: string, doctorId?: number) =>
  apiRequest<DayAppointments>(
    `/appointments?date=${date}&tab=all&limit=100${doctorParam(doctorId)}`,
  );

/** Counts per day for the date strip (at most 31 days). */
export const getAppointmentSummary = (
  from: string,
  to: string,
  doctorId?: number,
) =>
  apiRequest<{ days: DaySummary[] }>(
    `/appointments/summary?from=${from}&to=${to}${doctorParam(doctorId)}`,
  );
