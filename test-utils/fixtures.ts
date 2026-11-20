// Server-shaped test data (GET /queue, /auth/me, /me/appointments…).
//
// Dr. Sarah Johnson's queue at 10:35 AM on Wed 18 Nov 2026 — the late-arrival
// scenario: A-11 is with the doctor, A-12 (10:15) has not arrived after the
// 10-minute grace period, A-13 (10:30) has checked in and is up next, A-15 was
// already moved from 10:00 to 11:00.

import type {
  MyAppointment,
  MyAppointmentDetail,
} from '../src/api/myAppointments';
import type { StaffMe } from '../src/api/profile';
import type {
  QueueCard,
  QueueLineEntry,
  QueueSnapshot,
} from '../src/api/queue';

export const TODAY = '2026-11-18';
export const NOW = new Date(2026, 10, 18, 10, 35);

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Not arrived',
  checked_in: 'Waiting',
  called: 'Called',
  in_consultation: 'In room',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};

const label12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${
    h < 12 ? 'AM' : 'PM'
  }`;
};

export function card(
  id: number,
  token: string | null,
  name: string,
  slot: string | null,
  status: QueueCard['status'],
  over: Partial<QueueCard> = {},
): QueueCard {
  return {
    id,
    appointmentCode: `APT-20261118-${String(id).padStart(3, '0')}`,
    opdDate: TODAY,
    slotTime: slot,
    slotLabel: slot ? label12(slot) : null,
    originalSlotTime: null,
    token: token ? { number: Number(token.split('-')[1]), label: token } : null,
    status,
    statusLabel: STATUS_LABELS[status] ?? status,
    isOnline: true,
    reason: 'Fever',
    patient: {
      id: 100 + id,
      fullName: name,
      age: 34,
      gender: 'male',
      ageGender: '34 M',
    },
    queue: {
      callCount: 0,
      skipped: false,
      lateMoves: 0,
      priority: false,
      waitingMinutes: null,
    },
    checkedInAt: null,
    lastVisit: null,
    ...over,
  };
}

const lineEntry = (
  c: QueueCard,
  position: number,
  eta: string,
): QueueLineEntry => ({
  ...c,
  position,
  arrived: c.status === 'checked_in',
  estimatedTime: eta,
  estimatedTimeLabel: label12(eta),
});

export function johnsonQueue(): QueueSnapshot {
  const done = card(10, 'A-10', 'Meera Joshi', '09:45', 'completed');
  const inRoom = card(
    11,
    'A-11',
    'Rohit Kulkarni',
    '10:00',
    'in_consultation',
    {
      reason: 'Headache',
      lastVisit: {
        date: '2026-08-12',
        diagnosis: 'Migraine',
        medicines: [{ displayName: 'Naproxen 250 mg' }],
      },
    },
  );
  const late = card(12, 'A-12', 'Amit Verma', '10:15', 'confirmed');
  const waiting = card(13, 'A-13', 'Priya Nair', '10:30', 'checked_in', {
    reason: 'Cough',
    isOnline: false,
    checkedInAt: '2026-11-18T04:50:00.000Z',
  });
  const booked = card(14, 'A-14', 'Kunal Shah', '10:45', 'confirmed');
  const moved = card(15, 'A-15', 'Sunita Rao', '11:00', 'confirmed', {
    originalSlotTime: '10:00',
    queue: {
      callCount: 0,
      skipped: false,
      lateMoves: 1,
      priority: false,
      waitingMinutes: null,
    },
  });
  return {
    date: TODAY,
    doctor: {
      id: 2,
      facilityId: 1,
      fullName: 'Dr. Sarah Johnson',
      departmentName: 'General Medicine',
      opdRoom: 'Room 103',
      tokenPrefix: 'A',
      consultMinutes: 10,
      availability: { status: 'available', label: 'In OPD' },
      sessions: [
        {
          weekday: 3,
          weekdayLabel: 'Wed',
          startTime: '09:00',
          endTime: '13:00',
          slotMinutes: 15,
        },
      ],
    },
    stats: { total: 6, waiting: 1, inRoom: 1, notArrived: 3, seen: 1 },
    nowServing: { ...inRoom, startedMinutesAgo: 5 },
    waiting: [{ ...waiting, queuePosition: 1, etaLabel: 'Next' }],
    items: [done, inRoom, late, waiting, booked, moved],
    line: [
      lineEntry(waiting, 1, '10:40'),
      lineEntry(booked, 2, '10:50'),
      lineEntry(moved, 3, '11:00'),
    ],
    late: [{ ...late, lateMinutes: 20 }],
    rules: {
      lateGraceMinutes: 10,
      lateArrivalRule: 'next_free_slot',
      bookingMode: 'instant',
      opdRunning: true,
    },
  };
}

/** Dr. Mehta (Room 105): on break, one patient waiting. */
export function mehtaQueue(): QueueSnapshot {
  const waiting = card(21, 'B-01', 'Sunil Joshi', '11:00', 'checked_in');
  return {
    ...johnsonQueue(),
    doctor: {
      ...johnsonQueue().doctor,
      id: 3,
      fullName: 'Dr. Rajesh Mehta',
      opdRoom: 'Room 105',
      tokenPrefix: 'B',
      availability: { status: 'on_break', label: 'On break' },
    },
    stats: { total: 1, waiting: 1, inRoom: 0, notArrived: 0, seen: 0 },
    nowServing: null,
    waiting: [{ ...waiting, queuePosition: 1, etaLabel: 'Next' }],
    items: [waiting],
    line: [lineEntry(waiting, 1, '11:00')],
    late: [],
  };
}

const staffBase = {
  facility: { id: 1, name: 'Sunrise Clinic' },
  email: null,
  phone: null,
  employeeId: 'EMP-0007',
  status: 'active',
  joiningDate: null,
};

export const ASSISTANT_ME: StaffMe = {
  ...staffBase,
  id: 7,
  role: 'assistant',
  fullName: 'Neha Patil',
  doctor: null,
  assistant: {
    desk: 'Desk 1',
    doctors: [
      { id: 2, fullName: 'Dr. Sarah Johnson' },
      { id: 3, fullName: 'Dr. Rajesh Mehta' },
    ],
  },
};

export const DOCTOR_ME: StaffMe = {
  ...staffBase,
  id: 2,
  role: 'doctor',
  fullName: 'Dr. Sarah Johnson',
  assistant: null,
  doctor: {
    departmentName: 'General Medicine',
    specialization: null,
    qualification: null,
    registrationNo: null,
    opdRoom: 'Room 103',
    tokenPrefix: 'A',
    consultMinutes: 10,
    consultationFee: 500,
    schedule: [],
  },
};

// --- Patient app ------------------------------------------------------------

export function myAppointment(
  id: number,
  over: Partial<MyAppointment> = {},
): MyAppointment {
  return {
    id,
    appointmentCode: `APT-20261118-${String(id).padStart(3, '0')}`,
    opdDate: TODAY,
    slotTime: '10:30',
    slotLabel: '10:30 AM',
    originalSlotTime: null,
    token: { number: 13, label: 'A-13' },
    status: 'confirmed',
    statusLabel: 'Not arrived',
    reason: 'Cough',
    patient: { id: 113, fullName: 'Priya Nair' },
    doctor: { id: 2, fullName: 'Dr. Sarah Johnson', opdRoom: 'Room 103' },
    facility: { id: 1, name: 'Sunrise Clinic' },
    department: { id: 1, name: 'General Medicine' },
    ...over,
  };
}

export function myDetail(
  id: number,
  over: Partial<MyAppointmentDetail> = {},
): MyAppointmentDetail {
  const base = myAppointment(id, over);
  return {
    ...base,
    queueStatus: {
      position: 2,
      peopleAhead: 2,
      estimatedTime: '10:50',
      estimatedTimeLabel: '10:50 AM',
      upNext: false,
      inRoom: false,
      late: false,
    },
    steps: [
      {
        key: 'booked',
        label: 'Booked',
        at: '2026-11-17T15:32:00.000Z',
        done: true,
      },
      {
        key: 'confirmed',
        label: 'Confirmed',
        at: '2026-11-17T15:32:00.000Z',
        done: true,
      },
      {
        key: 'checked_in',
        label: 'Checked in',
        at: null,
        done: base.status !== 'confirmed' && base.status !== 'pending',
      },
      {
        key: 'in_consultation',
        label: 'In consultation',
        at: null,
        done: false,
      },
    ],
    timeline: [],
    ...over,
  };
}
