// The assistant desk's view of one doctor's day, built from GET /queue.

import type {
  DoctorAvailability,
  QueueCard,
  QueueSnapshot,
} from '../../api/queue';
import { formatSlotTime, formatTime } from '../../utils/format';

export type DeskPatient = {
  appointmentId: number;
  /** "A-12"; "—" before a token is issued. */
  token: string;
  name: string;
  /** "34 M" */
  ageGender: string;
  complaint: string;
  /** Slot time (booked) or arrival time (walk-in), e.g. "10:15 AM". */
  time: string;
  source: 'online' | 'walk_in';
  /** Estimated consultation time while in the line, e.g. "10:45 AM". */
  eta: string | null;
  /** First booked slot, when the queue moved them for being late. */
  movedFrom: string | null;
  /** Late patients: minutes past their slot. */
  lateMinutes: number;
};

/**
 * One doctor's tokens today. A booked patient goes
 * notArrived → (late, if not here by slot + grace) → waiting → nowServing → done.
 */
export type DoctorQueue = {
  id: number;
  name: string;
  room: string;
  availability: { status: DoctorAvailability; label: string };
  done: DeskPatient[];
  nowServing: (DeskPatient & { inConsultation: boolean }) | null;
  /** Checked in, in call order. */
  waiting: DeskPatient[];
  /** Booked and still on time. */
  notArrived: DeskPatient[];
  /** Booked, not here after slot + grace. */
  late: DeskPatient[];
  rules: QueueSnapshot['rules'];
};

export type DeskData = {
  deskName: string;
  doctors: DoctorQueue[];
};

const NO_TOKEN = '—';

/** Slot time (booked) or check-in time (walk-in without a slot), else ''. */
export function arrivalTime(card: QueueCard): string {
  if (card.slotTime) {
    return formatSlotTime(card.slotTime);
  }
  return card.checkedInAt ? formatTime(new Date(card.checkedInAt)) : '';
}

export function toDeskPatient(
  card: QueueCard,
  extra: { eta?: string | null; lateMinutes?: number } = {},
): DeskPatient {
  return {
    appointmentId: card.id,
    token: card.token?.label ?? NO_TOKEN,
    name: card.patient.fullName,
    ageGender: card.patient.ageGender,
    complaint: card.reason ?? '',
    time: arrivalTime(card),
    source: card.isOnline ? 'online' : 'walk_in',
    eta: extra.eta ?? null,
    movedFrom: card.originalSlotTime
      ? formatSlotTime(card.originalSlotTime)
      : null,
    lateMinutes: extra.lateMinutes ?? 0,
  };
}

export function toDoctorQueue(q: QueueSnapshot): DoctorQueue {
  const eta = new Map(q.line.map(e => [e.id, e.estimatedTimeLabel]));
  const lateIds = new Set(q.late.map(l => l.id));
  const linePosition = new Map(q.line.map(e => [e.id, e.position]));
  const patient = (card: QueueCard) =>
    toDeskPatient(card, { eta: eta.get(card.id) ?? null });

  return {
    id: q.doctor.id,
    name: q.doctor.fullName,
    room: q.doctor.opdRoom ?? 'OPD',
    availability: q.doctor.availability,
    done: q.items.filter(c => c.status === 'completed').map(patient),
    nowServing: q.nowServing
      ? {
          ...patient(q.nowServing),
          inConsultation: q.nowServing.status === 'in_consultation',
        }
      : null,
    waiting: q.waiting.map(patient),
    notArrived: q.items
      .filter(c => c.status === 'confirmed' && !lateIds.has(c.id))
      .sort(
        (a, b) =>
          (linePosition.get(a.id) ?? 999) - (linePosition.get(b.id) ?? 999),
      )
      .map(patient),
    late: q.late.map(l => toDeskPatient(l, { lateMinutes: l.lateMinutes })),
    rules: q.rules,
  };
}

/** Every token the doctor has today, in any state. */
export const tokensToday = (d: DoctorQueue) =>
  d.done.length +
  (d.nowServing ? 1 : 0) +
  d.waiting.length +
  d.notArrived.length +
  d.late.length;

export const LATE_RULE_LABELS = {
  next_free_slot: 'Next free slot',
  after_current: 'Right after the patient inside',
  end_of_queue: 'End of the queue',
} as const;

/** "Dr. Sarah Johnson" → "Dr. Johnson" */
export const shortDoctorName = (name: string) =>
  `Dr. ${name.split(/\s+/).slice(-1)[0]}`;
