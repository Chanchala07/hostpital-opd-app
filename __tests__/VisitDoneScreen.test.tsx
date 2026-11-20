/**
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import * as queueApi from '../src/api/queue';
import type { QueueSnapshot, VisitSummary } from '../src/api/queue';
import VisitDoneScreen from '../src/screens/doctor/VisitDoneScreen';
import { NOW, johnsonQueue } from '../test-utils/fixtures';
import { mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/queue', () => ({
  getQueue: jest.fn(),
  getVisitSummary: jest.fn(),
  callNext: jest.fn(),
  setAvailability: jest.fn(),
}));

const api = queueApi as unknown as Record<string, jest.Mock>;

/** A-11 (Rohit Kulkarni) has just been seen, 10:16 – 10:30. */
function summary(over: Partial<VisitSummary> = {}): VisitSummary {
  return {
    visit: {
      id: 77,
      appointmentId: 11,
      visitDate: '2026-11-18',
      diagnosis: 'Tension headache',
      followUpDate: '2026-11-23',
      token: 'A-11',
      startedAt: new Date(2026, 10, 18, 10, 16).toISOString(),
      completedAt: new Date(2026, 10, 18, 10, 30).toISOString(),
      durationMinutes: 14,
    },
    patient: {
      id: 111,
      patientCode: 'PT-20111',
      fullName: 'Rohit Kulkarni',
      ageGender: '34 M',
    },
    prescription: {
      rxCode: 'RX-3502',
      items: [
        { displayName: 'Naproxen 250 mg' },
        { displayName: 'Pantoprazole 40 mg' },
        { displayName: 'Cetirizine 10 mg' },
      ],
    },
    ...over,
  };
}

/** Room free after A-11; A-13 has been waiting 8 minutes. */
function afterVisitQueue(): QueueSnapshot {
  const q = johnsonQueue();
  const done = { ...q.nowServing!, status: 'completed' as const };
  return {
    ...q,
    nowServing: null,
    stats: { ...q.stats, inRoom: 0, seen: 2 },
    items: q.items.map(a =>
      a.id === 11 ? { ...done, visitTypeLabel: 'Follow-up' } : a,
    ),
    waiting: q.waiting.map(w => ({
      ...w,
      visitTypeLabel: 'Follow-up',
      queue: { ...w.queue, waitingMinutes: 8 },
    })),
  };
}

const onBreak = (q: QueueSnapshot): QueueSnapshot => ({
  ...q,
  doctor: {
    ...q.doctor,
    availability: { status: 'on_break', label: 'On break' },
  },
});

beforeEach(() => {
  pinDate(NOW);
  for (const fn of Object.values(api)) {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      fn.mockReset();
    }
  }
  api.getVisitSummary.mockResolvedValue(summary());
  api.getQueue.mockResolvedValue(afterVisitQueue());
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderDone() {
  const navigation = { goBack: jest.fn() };
  const s = await mount(
    <VisitDoneScreen
      navigation={navigation as never}
      route={
        {
          key: 'VisitDone',
          name: 'VisitDone',
          params: { visitId: 77 },
        } as never
      }
    />,
  );
  return { ...s, navigation };
}

test('shows the finished visit and who is up next', async () => {
  const s = await renderDone();
  expect(api.getVisitSummary).toHaveBeenCalledWith(77);
  expect(s.allText()).toContain('Room 103 · Wed, 18 Nov');
  expect(s.textIn('seen-count')).toBe('2 of 6 seen');

  const visit = s.textIn('visit-summary');
  expect(visit).toMatch(/for token\s+A-11/); // token in bold (nested Text)
  expect(visit).toContain('Rohit Kulkarni');
  expect(visit).toContain('34 M · PT-20111 · Follow-up');
  expect(s.textIn('visit-duration')).toBe('14 min');
  expect(visit).toContain('10:16 – 10:30');
  expect(visit).toMatch(/Diagnosis\nTension headache/);
  expect(visit).toMatch(/Medicines\n3 prescribed/);
  expect(visit).toMatch(/Rx number\nRX-3502/);
  expect(visit).toMatch(/Follow-up\nMon, 23 Nov/);

  const next = s.textIn('up-next');
  expect(next).toContain('UP NEXT');
  expect(next).toContain('Checked in · waiting 8 min');
  expect(next).toContain('A-13');
  expect(next).toContain('Priya Nair');
  expect(next).toContain('34 M · Follow-up · 10:30 AM slot');
  expect(next).toContain('Cough');
  expect(s.textIn('call-next')).toBe('Call next patient · A-13');

  // Not on this screen.
  const all = s.allText();
  for (const gone of [
    'Sent to patient',
    'Pharmacy',
    'Billing',
    'View prescription',
    'Print',
    'Book follow-up',
    'Medical history',
  ]) {
    expect(all).not.toContain(gone);
  }
});

test('"Call next patient" calls A-13 and goes back to the dashboard', async () => {
  api.callNext.mockResolvedValue({ data: {}, message: 'A-13 called' });
  const s = await renderDone();
  await s.press('call-next');
  expect(api.callNext).toHaveBeenCalledWith();
  expect(s.navigation.goBack).toHaveBeenCalled();
});

test('"No one is waiting" from the server keeps the screen', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  api.callNext.mockResolvedValue({ data: null, message: 'No one is waiting' });
  const s = await renderDone();
  await s.press('call-next');
  expect(alert).toHaveBeenCalledWith('No one is waiting', 'No one is waiting');
  expect(s.navigation.goBack).not.toHaveBeenCalled();
});

test('"Take a break" goes on break and back to the dashboard', async () => {
  api.setAvailability.mockResolvedValue({ data: null, message: 'OK' });
  const s = await renderDone();
  await s.press('break-toggle');
  expect(api.setAvailability).toHaveBeenCalledWith(2, 'on_break');
  expect(s.navigation.goBack).toHaveBeenCalled();
});

test('on break: calling is off until "End break"', async () => {
  api.getQueue.mockResolvedValue(onBreak(afterVisitQueue()));
  api.setAvailability.mockResolvedValue({ data: null, message: 'OK' });
  const s = await renderDone();
  expect(s.isDisabled('call-next')).toBe(true);
  expect(s.allText()).toContain("You're on break.");
  expect(s.textIn('break-toggle')).toBe('End break');

  api.getQueue.mockResolvedValue(afterVisitQueue());
  await s.press('break-toggle');
  expect(api.setAvailability).toHaveBeenCalledWith(2, 'available');
  expect(s.navigation.goBack).not.toHaveBeenCalled();
  expect(s.isDisabled('call-next')).toBe(false);
  expect(s.textIn('break-toggle')).toBe('Take a break');
});

test('nobody waiting, no medicines, no follow-up', async () => {
  api.getQueue.mockResolvedValue({ ...afterVisitQueue(), waiting: [] });
  api.getVisitSummary.mockResolvedValue(
    summary({
      prescription: null,
      visit: { ...summary().visit, followUpDate: null },
    }),
  );
  const s = await renderDone();
  expect(s.exists('call-next')).toBe(false);
  expect(s.textIn('up-next')).toContain(
    'No one is waiting. 3 booked, not arrived yet.',
  );
  const visit = s.textIn('visit-summary');
  expect(visit).toMatch(/Medicines\nNone/);
  expect(visit).toMatch(/Rx number\n—/);
  expect(visit).toMatch(/Follow-up\nNot set/);

  await s.press('back-to-dashboard');
  expect(s.navigation.goBack).toHaveBeenCalled();
});

test('a patient already called in by the desk: nothing to call', async () => {
  const q = afterVisitQueue();
  api.getQueue.mockResolvedValue({
    ...q,
    nowServing: { ...q.waiting[0], status: 'called', startedMinutesAgo: null },
    waiting: [],
  });
  const s = await renderDone();
  expect(s.textIn('up-next')).toMatch(/CALLED IN[\s\S]*Priya Nair/);
  expect(s.exists('call-next')).toBe(false);
});

test('load failure offers "Try again"', async () => {
  const { ApiError } = jest.requireActual('../src/api/client');
  api.getVisitSummary.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderDone();
  expect(s.textIn('visit-error')).toContain("Can't reach the server.");
  await s.press('visit-error-retry');
  expect(s.textIn('visit-summary')).toContain('Rohit Kulkarni');
});
