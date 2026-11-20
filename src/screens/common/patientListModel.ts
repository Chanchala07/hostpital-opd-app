// Today's patients (doctor's and desk's "Patients" tab), built from each
// doctor's GET /queue snapshot.

import type { QueueCard, QueueSnapshot } from '../../api/queue';
import { MONTHS } from '../../utils/format';
import { arrivalTime } from '../assistant/deskModel';

export type PatientStatus = 'in_room' | 'waiting' | 'not_arrived' | 'seen';

export type TodayPatient = {
  appointmentId: number;
  patientId: number;
  patientCode: string | null;
  phone: string | null;
  name: string;
  /** "34 M" */
  ageGender: string;
  /** "A-12"; "—" before a token is issued. */
  token: string;
  /** Slot or arrival time, e.g. "10:15 AM"; '' if neither. */
  time: string;
  complaint: string;
  status: PatientStatus;
  /** "online" = patient app / website. */
  source: 'online' | 'walk_in' | 'other';
  /** For "other": e.g. "OPD desk", "Follow-up booking". */
  sourceLabel: string;
  /** First visit at this clinic. */
  isNew: boolean;
  /** "12 Aug 2026 · Migraine" */
  lastVisit: string | null;
  /** Booked, not here after slot + grace: minutes past the slot. */
  lateMinutes: number;
  /** Place in the doctor's line (1 = next); null once in the room or seen. */
  position: number | null;
  doctorId: number;
  doctorName: string;
  room: string | null;
};

const STATUS_OF: Partial<Record<QueueCard['status'], PatientStatus>> = {
  called: 'in_room',
  in_consultation: 'in_room',
  checked_in: 'waiting',
  confirmed: 'not_arrived',
  completed: 'seen',
};

const STATUS_ORDER: Record<PatientStatus, number> = {
  in_room: 0,
  waiting: 1,
  not_arrived: 2,
  seen: 3,
};

/** "2026-08-12" → "12 Aug 2026" */
export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function sourceOf(card: QueueCard): Pick<TodayPatient, 'source' | 'sourceLabel'> {
  if (card.isOnline) {
    return { source: 'online', sourceLabel: 'Online' };
  }
  if (!card.source || card.source === 'walk_in') {
    return { source: 'walk_in', sourceLabel: 'Walk-in' };
  }
  return { source: 'other', sourceLabel: card.sourceLabel ?? 'OPD desk' };
}

/** One doctor's patients today, in any queue state. */
export function toTodayPatients(q: QueueSnapshot): TodayPatient[] {
  const linePosition = new Map(q.line.map(e => [e.id, e.position]));
  const lateBy = new Map(q.late.map(l => [l.id, l.lateMinutes]));
  const result: TodayPatient[] = [];
  for (const card of q.items) {
    const status = STATUS_OF[card.status];
    if (!status) {
      continue; // cancelled / no-show never reach the queue, but be safe
    }
    const last = card.lastVisit;
    result.push({
      appointmentId: card.id,
      patientId: card.patient.id,
      patientCode: card.patient.patientCode ?? null,
      phone: card.patient.phone ?? null,
      name: card.patient.fullName,
      ageGender: card.patient.ageGender,
      token: card.token?.label ?? '—',
      time: arrivalTime(card),
      complaint: card.reason ?? '',
      status,
      ...sourceOf(card),
      isNew: card.isNewPatient ?? !last,
      lastVisit: last
        ? [formatIsoDate(last.date), last.diagnosis].filter(Boolean).join(' · ')
        : null,
      lateMinutes: lateBy.get(card.id) ?? 0,
      position: linePosition.get(card.id) ?? null,
      doctorId: q.doctor.id,
      doctorName: q.doctor.fullName,
      room: q.doctor.opdRoom,
    });
  }
  return result;
}

/** "10:15 AM" → minutes since midnight; '' sorts last. */
function minutesOf(time: string): number {
  const [, h, m, period] = /(\d+):(\d+)\s*(AM|PM)/i.exec(time) ?? [];
  if (!h) {
    return 24 * 60;
  }
  return ((Number(h) % 12) + (/pm/i.test(period) ? 12 : 0)) * 60 + Number(m);
}

/**
 * In the room first, then the line in queue order (waiting, then not
 * arrived), then those already seen; ties by time.
 */
export const sortPatients = (patients: TodayPatient[]) =>
  [...patients].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.position ?? 999) - (b.position ?? 999) ||
      minutesOf(a.time) - minutesOf(b.time),
  );

/** Search box: name, token, complaint, PT code or phone. */
export function matchesQuery(p: TodayPatient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return [p.name, p.token, p.complaint, p.patientCode ?? '', p.phone ?? ''].some(
    field => field.toLowerCase().includes(q),
  );
}
