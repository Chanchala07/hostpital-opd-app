// Pure helpers for the booking screen (easy to test on their own).

import type {
  DaySlots,
  PortalDoctor,
  SlotDto,
  VisitType,
} from '../../api/booking';
import type { OpdSessionDto } from '../../api/profile';
import { formatSlotTime } from '../../utils/format';

/** Quick picks under "What's the problem?" (also sent as symptoms). */
export const PROBLEM_SUGGESTIONS = [
  'Fever',
  'Cough & cold',
  'Follow-up',
  'Stomach pain',
];

/** How many OPD days to offer, and how far ahead to look for them. */
export const DAYS_SHOWN = 5;
const LOOK_AHEAD_DAYS = 21;

/** Local date → "YYYY-MM-DD" (the API's date format). */
export function toIsoDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** The doctor's next OPD days (from their weekly schedule), from today. */
export function nextOpdDates(
  schedule: OpdSessionDto[],
  today: Date,
  count = DAYS_SHOWN,
): Date[] {
  const weekdays = new Set(schedule.map(s => s.weekday));
  const dates: Date[] = [];
  for (let i = 0; i < LOOK_AHEAD_DAYS && dates.length < count; i++) {
    const day = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + i,
    );
    if (weekdays.has(day.getDay())) {
      dates.push(day);
    }
  }
  return dates;
}

export type Department = { id: number; name: string };

/** Departments that have doctors, in the doctors' order. */
export function departmentsOf(doctors: PortalDoctor[]): Department[] {
  const seen = new Map<number, string>();
  doctors.forEach(d => {
    const id = d.departmentId ?? 0;
    if (!seen.has(id)) {
      seen.set(id, d.departmentName ?? 'Other');
    }
  });
  return [...seen].map(([id, name]) => ({ id, name }));
}

export const departmentIdOf = (doctor: PortalDoctor) =>
  doctor.departmentId ?? 0;

export const isBookable = (slot: SlotDto) =>
  slot.state === 'open' || slot.state === 'few';

export const freeSlots = (day: DaySlots | null) =>
  day ? day.slots.filter(isBookable) : [];

/** Date tile caption: "3 left", "Full", or "Closed" (OPD over / no OPD). */
export function dayCaption(day: DaySlots): string {
  const free = freeSlots(day).length;
  if (free > 0) {
    return `${free} left`;
  }
  const bookedOut = day.slots.some(s => s.state === 'full');
  return bookedOut ? 'Full' : 'Closed';
}

/** "09:00 AM – 01:00 PM" (several sessions joined with ", "). */
export const sessionsLabel = (sessions: OpdSessionDto[]) =>
  sessions
    .map(s => `${formatSlotTime(s.startTime)} – ${formatSlotTime(s.endTime)}`)
    .join(', ');

/** Tags + typed text → the booking's reason, e.g. "Fever — since 2 days". */
export function buildReason(tags: string[], text: string): string {
  return [tags.join(', '), text.trim()].filter(Boolean).join(' — ');
}

export const visitTypeFor = (tags: string[]): VisitType =>
  tags.includes('Follow-up') ? 'follow_up' : 'new';
