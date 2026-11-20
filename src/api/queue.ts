// The live OPD queue (desk + doctor): GET /queue and the actions on it.
// After any action the server re-orders the line, sends "Your turn is next"
// to the first patient and SMS / app notifications, so the app just refetches.

import { apiCall, apiRequest } from './client';
import type { OpdSessionDto } from './profile';

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'declined'
  | 'checked_in'
  | 'called'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

/** Where a late patient goes back in: the clinic's rule unless the desk picks. */
export type LateArrivalRule =
  | 'next_free_slot'
  | 'after_current'
  | 'end_of_queue';

export type DoctorAvailability = 'available' | 'on_break' | 'late' | 'off';

export type AppointmentSource =
  | 'patient_app'
  | 'website'
  | 'desk'
  | 'walk_in'
  | 'follow_up';

/** One appointment as the queue screens show it (part of the server's DTO). */
export type QueueCard = {
  id: number;
  appointmentCode: string;
  opdDate: string;
  /** "HH:mm"; null for a walk-in without a slot. */
  slotTime: string | null;
  /** "10:30 AM" */
  slotLabel: string | null;
  /** The slot first booked, when the queue moved the patient for being late. */
  originalSlotTime: string | null;
  token: { number: number; label: string } | null;
  status: AppointmentStatus;
  /** e.g. "Not arrived", "Waiting", "In room" */
  statusLabel: string;
  /** Booked from the patient app or website. */
  isOnline: boolean;
  source?: AppointmentSource;
  /** e.g. "Walk-in", "OPD desk", "Patient app" */
  sourceLabel?: string;
  /** "New", "Follow-up", "Check-up" */
  visitTypeLabel?: string;
  reason: string | null;
  patient: {
    id: number;
    /** "PT-20418" */
    patientCode?: string;
    fullName: string;
    age: number;
    gender: 'female' | 'male' | 'other';
    /** "34 M" */
    ageGender: string;
    phone?: string | null;
  };
  queue: {
    callCount: number;
    skipped: boolean;
    lateMoves: number;
    /** Put right after the patient in the room (late, after_current). */
    priority: boolean;
    waitingMinutes: number | null;
  };
  checkedInAt: string | null;
  /** Previous completed visit at this clinic, if any. */
  lastVisit?: {
    date: string;
    diagnosis: string | null;
    medicines: { displayName: string }[];
  } | null;
  /** No earlier completed visit at this clinic. */
  isNewPatient?: boolean;
};

export type QueueLineEntry = QueueCard & {
  /** 1 = up next */
  position: number;
  arrived: boolean;
  /** "HH:mm" */
  estimatedTime: string;
  /** "10:45 AM" */
  estimatedTimeLabel: string;
};

export type QueueSnapshot = {
  date: string;
  doctor: {
    id: number;
    facilityId: number;
    fullName: string;
    departmentName: string | null;
    opdRoom: string | null;
    tokenPrefix: string | null;
    consultMinutes: number;
    availability: { status: DoctorAvailability; label: string };
    sessions: OpdSessionDto[];
  };
  stats: {
    total: number;
    waiting: number;
    inRoom: number;
    notArrived: number;
    seen: number;
  };
  /** Called / in the room. */
  nowServing: (QueueCard & { startedMinutesAgo: number | null }) | null;
  /** Checked in, in call order. */
  waiting: (QueueCard & { queuePosition: number; etaLabel: string | null })[];
  /** Every appointment of the day in the queue (any status). */
  items: QueueCard[];
  /** Everyone still to be seen, arrived or not, in queue order. */
  line: QueueLineEntry[];
  /** Booked, not arrived after slot + grace. */
  late: (QueueCard & { lateMinutes: number })[];
  rules: {
    lateGraceMinutes: number;
    lateArrivalRule: LateArrivalRule;
    bookingMode: 'instant' | 'approval';
    opdRunning: boolean;
  };
};

/** A doctor sees their own queue (no doctorId); the desk picks the doctor. */
export const getQueue = (doctorId?: number) =>
  apiRequest<QueueSnapshot>(
    `/queue?filter=all${doctorId ? `&doctorId=${doctorId}` : ''}`,
  );

const post = <T = QueueCard>(path: string, body?: unknown) =>
  apiCall<T>(path, { method: 'POST', body: body ?? {} });

/** Calls the first waiting patient; `data` is null when no one is waiting. */
export const callNext = (doctorId?: number) =>
  post<QueueCard | null>('/queue/call-next', doctorId ? { doctorId } : {});

/** Arrived at the desk. A late patient is placed by the clinic's rule. */
export const checkIn = (appointmentId: number) =>
  post(`/appointments/${appointmentId}/check-in`);

/** Puts a late patient back in the line (checks them in if needed). */
export const reinsert = (appointmentId: number, position?: LateArrivalRule) =>
  post(`/appointments/${appointmentId}/reinsert`, position ? { position } : {});

export const callPatient = (appointmentId: number) =>
  post(`/appointments/${appointmentId}/call`);

export const recall = (appointmentId: number) =>
  post(`/appointments/${appointmentId}/recall`);

/** Back to the waiting list, after everyone not skipped. */
export const skip = (appointmentId: number) =>
  post(`/appointments/${appointmentId}/skip`);

export const markNoShow = (appointmentId: number) =>
  post(`/appointments/${appointmentId}/no-show`);

/** Doctor only: the patient is in the room; returns the new visit. */
export const startConsultation = (appointmentId: number) =>
  post<{ visitId: number; appointment: QueueCard }>(
    `/appointments/${appointmentId}/start`,
  );

/** The visit of an appointment in consultation (after an app restart). */
export const getVisitId = async (appointmentId: number) =>
  (
    await apiRequest<{ visitId: number | null }>(
      `/appointments/${appointmentId}`,
    )
  ).visitId;

export type CompletedVisit = {
  calledNext: QueueCard | null;
  callNextError: string | null;
};

/** Doctor: closes the visit (diagnosis required) and can call the next one. */
export const completeVisit = (
  visitId: number,
  input: { diagnosis: string; callNext: boolean },
) => post<CompletedVisit>(`/visits/${visitId}/complete`, input);

/** "Visit completed": a closed visit (part of the server's summary). */
export type VisitSummary = {
  visit: {
    id: number;
    appointmentId: number | null;
    /** "YYYY-MM-DD" */
    visitDate: string;
    diagnosis: string | null;
    /** "YYYY-MM-DD" */
    followUpDate: string | null;
    /** "A-12" */
    token: string | null;
    startedAt: string | null;
    completedAt: string | null;
    durationMinutes: number | null;
  };
  patient: {
    id: number;
    /** "PT-20418" */
    patientCode: string;
    fullName: string;
    /** "34 M" */
    ageGender: string;
  };
  /** Null when no medicines were written. */
  prescription: {
    /** "RX-3502"; set once the visit is completed. */
    rxCode: string | null;
    items: { displayName: string }[];
  } | null;
};

/** Doctor: the summary of a completed visit. */
export const getVisitSummary = (visitId: number) =>
  apiRequest<VisitSummary>(`/visits/${visitId}/summary`);

export const setAvailability = (
  doctorId: number,
  availability: DoctorAvailability,
) =>
  apiCall<unknown>(`/doctors/${doctorId}/availability`, {
    method: 'PATCH',
    body: { availability },
  });
