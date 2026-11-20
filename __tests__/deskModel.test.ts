import {
  shortDoctorName,
  toDoctorQueue,
  tokensToday,
} from '../src/screens/assistant/deskModel';
import { johnsonQueue } from '../test-utils/fixtures';

test('splits GET /queue into in room / waiting / not arrived / late / done', () => {
  const d = toDoctorQueue(johnsonQueue());
  expect(d).toMatchObject({
    id: 2,
    name: 'Dr. Sarah Johnson',
    room: 'Room 103',
  });
  expect(d.nowServing).toMatchObject({ token: 'A-11', inConsultation: true });
  expect(d.waiting.map(p => p.token)).toEqual(['A-13']);
  // Booked and still on time, in line order; the late one is apart.
  expect(d.notArrived.map(p => p.token)).toEqual(['A-14', 'A-15']);
  expect(d.late.map(p => p.token)).toEqual(['A-12']);
  expect(d.done.map(p => p.token)).toEqual(['A-10']);
  expect(tokensToday(d)).toBe(6);
});

test('carries estimated times, moves, lateness and the clinic rules', () => {
  const d = toDoctorQueue(johnsonQueue());
  expect(d.waiting[0]).toMatchObject({
    appointmentId: 13,
    time: '10:30 AM',
    eta: '10:40 AM',
    source: 'walk_in',
    ageGender: '34 M',
  });
  expect(d.notArrived[1]).toMatchObject({
    token: 'A-15',
    time: '11:00 AM',
    movedFrom: '10:00 AM',
  });
  expect(d.late[0]).toMatchObject({ token: 'A-12', lateMinutes: 20 });
  expect(d.rules).toMatchObject({
    lateGraceMinutes: 10,
    lateArrivalRule: 'next_free_slot',
  });
});

test('a walk-in without a slot shows when they arrived', () => {
  const q = johnsonQueue();
  q.waiting[0] = { ...q.waiting[0], slotTime: null, slotLabel: null };
  const d = toDoctorQueue(q);
  expect(d.waiting[0].time).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
});

test('short doctor names', () => {
  expect(shortDoctorName('Dr. Sarah Johnson')).toBe('Dr. Johnson');
});
