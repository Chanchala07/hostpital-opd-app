// What the patient's "My token" screen says, from GET /me/appointments/{id}.

import type {
  MyAppointment,
  MyAppointmentDetail,
} from '../../api/myAppointments';
import { formatSlotTime } from '../../utils/format';

const IN_QUEUE = ['called', 'in_consultation', 'checked_in'];
const OPEN = ['confirmed', 'pending'];

/**
 * The appointment to track: one already in the queue, else today's, else the
 * next upcoming one (the list comes in slot order).
 */
export function pickCurrent(
  list: MyAppointment[],
  todayIso: string,
): MyAppointment | null {
  return (
    list.find(a => IN_QUEUE.includes(a.status)) ??
    list.find(a => a.opdDate === todayIso && OPEN.includes(a.status)) ??
    list.find(a => a.opdDate >= todayIso && OPEN.includes(a.status)) ??
    null
  );
}

export type BannerTone = 'success' | 'info' | 'warning' | 'danger';

export type TokenView = {
  banner: { tone: BannerTone; title: string; body: string | null };
  /** Small caps line on the token card, e.g. "YOUR TURN IS NEXT". */
  headline: string;
  estimatedTime: string;
  ahead: string;
  position: string;
  /** Under "Your place in the queue". */
  queueNote: string;
  canCancel: boolean;
  /** The screen keeps refreshing while this is true. */
  live: boolean;
};

const roomOf = (a: MyAppointmentDetail) =>
  a.doctor.opdRoom
    ? `Room ${a.doctor.opdRoom.replace(/^room\s+/i, '')}`
    : "the doctor's cabin";

export function tokenView(a: MyAppointmentDetail, todayIso: string): TokenView {
  const q = a.queueStatus;
  const room = roomOf(a);
  const slot = a.slotLabel ?? (a.slotTime ? formatSlotTime(a.slotTime) : '—');
  const moved =
    a.originalSlotTime && a.slotTime && a.originalSlotTime !== a.slotTime
      ? formatSlotTime(a.originalSlotTime)
      : null;
  const isToday = a.opdDate === todayIso;

  const base: TokenView = {
    banner: { tone: 'success', title: 'Appointment confirmed', body: null },
    headline: a.statusLabel.toUpperCase(),
    estimatedTime: q?.estimatedTimeLabel ?? slot,
    ahead: q?.peopleAhead != null ? String(q.peopleAhead) : '—',
    position: q?.position != null ? `#${q.position}` : '—',
    queueNote: '',
    canCancel: OPEN.includes(a.status),
    live: isToday && [...IN_QUEUE, ...OPEN].includes(a.status),
  };

  switch (a.status) {
    case 'pending':
      return {
        ...base,
        banner: {
          tone: 'info',
          title: 'Waiting for the clinic to confirm',
          body: "You'll get your token number when they confirm.",
        },
        headline: 'REQUEST SENT',
        queueNote: 'Your place in the queue shows once the clinic confirms.',
      };
    case 'called':
      return {
        ...base,
        banner: {
          tone: 'success',
          title: "It's your turn",
          body: `Please go in now · ${a.doctor.fullName} · ${room}.`,
        },
        headline: 'PLEASE GO IN',
        estimatedTime: 'Now',
        ahead: '0',
        queueNote: `Please go to ${room}.`,
      };
    case 'in_consultation':
      return {
        ...base,
        banner: { tone: 'success', title: 'With the doctor', body: null },
        headline: 'WITH DOCTOR',
        estimatedTime: 'Now',
        ahead: '0',
        queueNote: 'Your prescription will appear here after the visit.',
      };
    case 'completed':
      return {
        ...base,
        banner: { tone: 'success', title: 'Visit complete', body: null },
        headline: 'VISIT COMPLETE',
        estimatedTime: '—',
        queueNote: 'Your prescription is in the Prescriptions tab.',
      };
    case 'cancelled':
    case 'no_show':
    case 'declined':
      return {
        ...base,
        banner: {
          tone: 'danger',
          title: `Appointment ${a.statusLabel.toLowerCase()}`,
          body: 'Book again if you still need to see the doctor.',
        },
        estimatedTime: '—',
        queueNote: '',
      };
  }

  // Confirmed (booked) or checked in (waiting).
  if (q?.late) {
    return {
      ...base,
      banner: {
        tone: 'danger',
        title: 'You missed your slot',
        body: `Your ${slot} slot has passed. Check in at the desk when you arrive and they'll put you back in the queue.`,
      },
      headline: 'LATE',
      queueNote: "You're not in the queue until you check in at the desk.",
    };
  }
  if (q?.upNext) {
    return {
      ...base,
      banner: {
        tone: 'success',
        title: 'Your turn is next',
        body: `Please proceed to the doctor's cabin · ${a.doctor.fullName} · ${room}.`,
      },
      headline: "YOU'RE NEXT",
      queueNote: `Please wait near ${room}.`,
    };
  }
  if (moved) {
    return {
      ...base,
      banner: {
        tone: 'warning',
        title: 'Your time has moved',
        body: `You hadn't checked in by your ${moved} slot, so you were moved to ${slot}. Estimated time: ${base.estimatedTime}.`,
      },
      queueNote: 'Check in at the desk as soon as you arrive.',
    };
  }
  const arrived = a.status === 'checked_in';
  return {
    ...base,
    banner: {
      tone: 'success',
      title: 'Appointment confirmed',
      body: arrived
        ? null
        : isToday
        ? 'Check in at the desk when you arrive.'
        : null,
    },
    headline: arrived
      ? 'WAITING · CHECKED IN'
      : isToday
      ? 'NOT ARRIVED YET'
      : 'CONFIRMED',
    queueNote: arrived
      ? "We'll tell you when you're next."
      : isToday
      ? 'Check in at the desk when you arrive to keep your place.'
      : `Your slot is ${slot}. Your place in the queue shows on the day.`,
  };
}
