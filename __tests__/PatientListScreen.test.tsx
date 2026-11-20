/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ApiError } from '../src/api/client';
import * as patientsApi from '../src/api/patients';
import type { RegisteredPatient } from '../src/api/patients';
import * as profileApi from '../src/api/profile';
import * as queueApi from '../src/api/queue';
import type { QueueSnapshot } from '../src/api/queue';
import PatientListScreen, {
  REGISTRY_SEARCH_DELAY_MS,
  type PatientListViewer,
} from '../src/screens/common/PatientListScreen';
import {
  ASSISTANT_ME,
  DOCTOR_ME,
  NOW,
  johnsonQueue,
  mehtaQueue,
} from '../test-utils/fixtures';
import { flush, mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/queue', () => ({ getQueue: jest.fn() }));
jest.mock('../src/api/patients', () => ({ searchPatients: jest.fn() }));
jest.mock('../src/api/profile', () => ({
  ...jest.requireActual('../src/api/profile'),
  getMyProfile: jest.fn(),
}));

const getQueue = queueApi.getQueue as jest.Mock;
const searchPatients = patientsApi.searchPatients as jest.Mock;
const getMyProfile = profileApi.getMyProfile as jest.Mock;

/** Dr. Johnson's queue, with a desk booking and PT codes on two cards. */
function johnson(): QueueSnapshot {
  const q = johnsonQueue();
  q.items = q.items.map(c =>
    c.id === 14
      ? {
          ...c,
          isOnline: false,
          source: 'desk',
          sourceLabel: 'OPD desk',
          patient: { ...c.patient, patientCode: 'PT-20414', phone: '9800012345' },
        }
      : c,
  );
  return q;
}

function registered(
  id: number,
  fullName: string,
  over: Partial<RegisteredPatient> = {},
): RegisteredPatient {
  return {
    id,
    patientCode: `PT-${20000 + id}`,
    fullName,
    age: 29,
    gender: 'female',
    ageGender: '29 F',
    phone: '9811122233',
    lastVisitDate: null,
    visitCount: 0,
    ...over,
  };
}

beforeEach(() => {
  pinDate(NOW);
  getQueue
    .mockReset()
    .mockImplementation(async (doctorId?: number) =>
      doctorId === 3 ? mehtaQueue() : johnson(),
    );
  getMyProfile.mockReset().mockResolvedValue(DOCTOR_ME);
  searchPatients.mockReset().mockResolvedValue([]);
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
});

async function renderList(
  viewer: PatientListViewer,
  extra: { place?: string; onFocus?: (cb: () => void) => () => void } = {},
) {
  const onBack = jest.fn();
  const screen = await mount(
    <PatientListScreen viewer={viewer} onBack={onBack} {...extra} />,
  );
  await flush();
  const cards = () =>
    screen.ids(/^patient-\d+$/).map(id => id.replace('patient-', ''));
  const search = (text: string) => screen.type('patient-search', text);
  return { ...screen, onBack, cards, search };
}

/** Lets the registry search's typing pause pass. */
const waitForRegistry = async () => {
  await ReactTestRenderer.act(async () => {
    await new Promise<void>(r => setTimeout(r, REGISTRY_SEARCH_DELAY_MS + 20));
  });
  await flush();
};

test('a doctor sees today’s patients from their queue: in room, line, then seen', async () => {
  const s = await renderList('doctor');
  expect(getQueue).toHaveBeenCalledWith(undefined); // "my" queue
  expect(s.allText()).toContain('Today · Room 103 · 6 patients');
  expect(s.allText()).toMatch(/All\n6\nIn queue\n2\nNot arrived\n3\nSeen\n1/);
  // Line order: A-14 (2nd), A-15 (3rd), then A-12 who is late and out of line.
  expect(s.cards()).toEqual(['11', '13', '14', '15', '12', '10']);

  expect(s.textIn('patient-11')).toBe(
    [
      'RK',
      'Rohit Kulkarni',
      '34 M · 10:00 AM',
      'A-11',
      'Headache',
      'Last visit 12 Aug 2026 · Migraine',
      'In your room',
      'Online',
      'Edit details',
      'Rx list',
      'Last Rx',
      'History',
    ].join('\n'),
  );
  expect(s.textIn('patient-13')).toMatch(/Waiting\nWalk-in\nNew patient/);
  expect(s.textIn('patient-14')).toMatch(/Not arrived\nOPD desk\nNew patient/);
  expect(s.textIn('patient-12')).toMatch(
    /Not arrived\nLate · 20 min\nOnline\nNew patient/,
  );
  expect(s.textIn('patient-10')).toContain('Seen');
  expect(s.exists('add-patient')).toBe(false); // no handler → no + button
});

test('filters and search narrow today’s list', async () => {
  const s = await renderList('doctor');
  await s.press('filter-queue');
  expect(s.cards()).toEqual(['11', '13']);
  await s.press('filter-not_arrived');
  expect(s.cards()).toEqual(['14', '15', '12']);
  await s.press('filter-seen');
  expect(s.cards()).toEqual(['10']);
  await s.press('filter-all');

  await s.search('cough');
  expect(s.cards()).toEqual(['13']);
  expect(s.allText()).toMatch(/All\n1\nIn queue\n1/);
  await s.search('a-14');
  expect(s.cards()).toEqual(['14']);
  await s.search('pt-20414'); // patient code
  expect(s.cards()).toEqual(['14']);
  await s.search('98000'); // phone
  expect(s.cards()).toEqual(['14']);
  await s.search('xyz');
  expect(s.cards()).toEqual([]);
  expect(s.textIn('patients-empty')).toBe('No patients today match "xyz".');
});

test('searching also lists other registered patients not booked today', async () => {
  searchPatients.mockResolvedValue([
    registered(113, 'Priya Nair'), // already in today's list (A-13)
    registered(500, 'Priya Sharma', {
      visitCount: 3,
      lastVisitDate: '2026-09-02',
    }),
    registered(501, 'Priyanka Das'),
  ]);
  const s = await renderList('doctor');

  await s.search('p'); // too short to search the registry
  await waitForRegistry();
  expect(searchPatients).not.toHaveBeenCalled();
  expect(s.exists('registry')).toBe(false);

  await s.search('priya');
  expect(s.textIn('registry-note')).toBe('Searching all patients…');
  await waitForRegistry();
  expect(searchPatients).toHaveBeenCalledWith('priya');
  expect(s.cards()).toEqual(['13']);
  expect(s.ids(/^registered-/)).toEqual(['registered-500', 'registered-501']);
  expect(s.textIn('registered-500')).toBe(
    ['PS', 'Priya Sharma', '29 F · PT-20500', '3 visits · last 2 Sep 2026'].join(
      '\n',
    ),
  );
  expect(s.textIn('registered-501')).toContain('No visits yet');

  // Only under "All": the other tabs are about today.
  await s.press('filter-queue');
  expect(s.exists('registry')).toBe(false);
  await s.press('filter-all');

  searchPatients.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  await s.search('sharma');
  await waitForRegistry();
  expect(s.textIn('registry-note')).toBe(
    'Could not search all patients right now.',
  );
});

test('an assistant sees each of their doctors’ patients, with the doctor named', async () => {
  getMyProfile.mockResolvedValue(ASSISTANT_ME);
  const s = await renderList('assistant', { place: 'Desk 1' });
  expect(getQueue.mock.calls.map(c => c[0])).toEqual([2, 3]);
  expect(s.allText()).toContain('Today · Desk 1 · 7 patients');
  expect(s.cards()).toEqual(['11', '13', '21', '14', '15', '12', '10']);
  expect(s.textIn('patient-11')).toContain('34 M · 10:00 AM · Dr. Johnson');
  expect(s.textIn('patient-11')).toContain('With doctor');
  expect(s.textIn('patient-21')).toContain('34 M · 11:00 AM · Dr. Mehta');
  await s.press('back');
  expect(s.onBack).toHaveBeenCalled();
});

test('coming back to the screen refreshes the list', async () => {
  let focus: () => void = () => {};
  const s = await renderList('doctor', {
    onFocus: cb => {
      focus = cb;
      return () => {};
    },
  });
  expect(s.cards()).toHaveLength(6);

  // A walk-in was added meanwhile.
  const later = johnson();
  const added = {
    ...later.items[3],
    id: 30,
    token: { number: 16, label: 'A-16' },
    patient: { ...later.items[3].patient, id: 130, fullName: 'Rahul Kapoor' },
    reason: 'Cough and cold',
  };
  later.items = [...later.items, added];
  getQueue.mockResolvedValueOnce(later);
  await ReactTestRenderer.act(async () => focus());
  await flush();
  expect(s.allText()).toContain('Today · Room 103 · 7 patients');
  expect(s.textIn('patient-30')).toContain('Rahul Kapoor');
  expect(s.textIn('patient-30')).toContain('Cough and cold');
});

test('shows why loading failed, and retries', async () => {
  getQueue.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderList('doctor');
  expect(s.textIn('patients-error')).toContain("Can't reach the server.");
  expect(s.exists('patient-search')).toBe(false);

  await s.press('patients-error-retry');
  expect(s.cards()).toHaveLength(6);
});

test('an empty day says so', async () => {
  getQueue.mockResolvedValue({ ...johnson(), items: [], line: [], late: [] });
  const s = await renderList('doctor');
  expect(s.allText()).toContain('Today · Room 103 · 0 patients');
  expect(s.textIn('patients-empty')).toBe('No patients booked for today yet.');
});
