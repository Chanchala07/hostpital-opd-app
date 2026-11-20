// Patient app: my appointments and the live status of one (queue position,
// estimated time, "your turn is next").

import { apiRequest } from './client';
import type { AppointmentStatus } from './queue';

export type MyAppointment = {
  id: number;
  appointmentCode: string;
  /** "YYYY-MM-DD" */
  opdDate: string;
  /** "HH:mm" */
  slotTime: string | null;
  slotLabel: string | null;
  /** The slot first booked, when the queue moved me for being late. */
  originalSlotTime: string | null;
  token: { number: number; label: string } | null;
  status: AppointmentStatus;
  statusLabel: string;
  reason: string | null;
  patient: { id: number; fullName: string };
  doctor: { id: number; fullName: string; opdRoom: string | null };
  facility: { id: number; name: string };
  department: { id: number | null; name: string | null };
};

export type QueueStatus = {
  /** 1 = up next; null when not in the line (e.g. late). */
  position: number | null;
  peopleAhead: number | null;
  /** "HH:mm" */
  estimatedTime: string | null;
  /** "10:45 AM" */
  estimatedTimeLabel: string | null;
  upNext: boolean;
  inRoom: boolean;
  /** Missed slot + grace and not checked in yet. */
  late: boolean;
};

export type StatusStep = {
  key: 'booked' | 'confirmed' | 'checked_in' | 'in_consultation';
  label: string;
  at: string | null;
  done: boolean;
};

export type TimelineEvent = {
  id: number;
  /** e.g. "moved_late", "reinserted", "called" */
  event: string;
  label: string;
  note: string | null;
  at: string;
};

export type MyAppointmentDetail = MyAppointment & {
  /** null once seen / closed (or before confirmation). */
  queueStatus: QueueStatus | null;
  steps: StatusStep[];
  timeline: TimelineEvent[];
};

/** `data` is the list (paging info is in the envelope's `meta`). */
export const listMyAppointments = (tab: 'upcoming' | 'past' = 'upcoming') =>
  apiRequest<MyAppointment[]>(`/me/appointments?tab=${tab}&limit=20`);

export const getMyAppointment = (id: number) =>
  apiRequest<MyAppointmentDetail>(`/me/appointments/${id}`);

export const cancelMyAppointment = (id: number, reason?: string) =>
  apiRequest<MyAppointmentDetail>(`/me/appointments/${id}/cancel`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });
