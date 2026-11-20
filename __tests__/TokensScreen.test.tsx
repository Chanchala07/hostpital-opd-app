/**
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import * as profileApi from '../src/api/profile';
import * as queueApi from '../src/api/queue';
import { AssistantDeskProvider } from '../src/screens/assistant/AssistantDeskContext';
import TokensScreen from '../src/screens/assistant/TokensScreen';
import { ApiError } from '../src/api/client';
import {
  ASSISTANT_ME,
  NOW,
  johnsonQueue,
  mehtaQueue,
} from '../test-utils/fixtures';
import { mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/profile', () => ({
  ...jest.requireActual('../src/api/profile'),
  getMyProfile: jest.fn(),
}));
jest.mock('../src/api/queue', () => ({
  getQueue: jest.fn(),
  callNext: jest.fn(),
  checkIn: jest.fn(),
  reinsert: jest.fn(),
  callPatient: jest.fn(),
  recall: jest.fn(),
  skip: jest.fn(),
  markNoShow: jest.fn(),
}));

const getMyProfile = profileApi.getMyProfile as jest.Mock;
const api = queueApi as unknown as Record<string, jest.Mock>;

const done = (message: string) => ({ data: null, message });

beforeEach(() => {
  pinDate(NOW);
  getMyProfile.mockReset().mockResolvedValue(ASSISTANT_ME);
  api.getQueue
    .mockReset()
    .mockImplementation(async (id: number) =>
      id === 2 ? johnsonQueue() : mehtaQueue(),
    );
  for (const name of ['checkIn', 'reinsert', 'callPatient', 'markNoShow']) {
    api[name].mockReset().mockResolvedValue(done('OK'));
  }
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const renderTokens = () =>
  mount(
    <AssistantDeskProvider>
      <TokensScreen onBack={jest.fn()} />
    </AssistantDeskProvider>,
  );

test("lists the doctor's tokens in queue order, with the late one apart", async () => {
  const s = await renderTokens();
  expect(api.getQueue).toHaveBeenCalledWith(2);
  expect(api.getQueue).toHaveBeenCalledWith(3);
  expect(s.allText()).toContain('Room 103 · 6 tokens · 1 waiting');
  expect(s.allText()).toMatch(
    /All\n6\nIn queue\n2\nNot arrived\n2\nLate\n1\nDone\n1/,
  );
  expect(s.textIn('queue-rules')).toBe(
    'Late after 10 min · late arrivals go to: Next free slot',
  );
  expect(s.ids(/^token-[A-Z]-\d+$/)).toEqual([
    'token-A-11',
    'token-A-13',
    'token-A-14',
    'token-A-15',
    'token-A-12',
    'token-A-10',
  ]);
  // Waiting: estimated time; moved patient: where they came from; late: how late.
  expect(s.textIn('token-A-13')).toContain('10:30 AM · est. 10:40 AM');
  expect(s.textIn('token-A-15')).toContain('Moved from 10:00 AM');
  expect(s.textIn('token-A-12')).toContain('10:15 AM · 20 min late');
  expect(s.exists('arrived-A-12')).toBe(true);
  expect(s.exists('check-in-A-14')).toBe(true);
  expect(s.exists('call-A-13')).toBe(true);
});

test('check in and call go to the API, then the queue reloads', async () => {
  const s = await renderTokens();
  api.getQueue.mockClear();

  await s.press('check-in-A-14');
  expect(api.checkIn).toHaveBeenCalledWith(14);
  expect(api.getQueue).toHaveBeenCalledWith(2);

  await s.press('call-A-13');
  expect(api.callPatient).toHaveBeenCalledWith(13);
});

test('a late patient who arrives can be put back by any rule, or marked no-show', async () => {
  const s = await renderTokens();

  await s.press('arrived-A-12');
  // Clinic rule first, then the others, then no-show.
  expect(s.ids(/^late-/)).toEqual([
    'late-next_free_slot',
    'late-after_current',
    'late-end_of_queue',
    'late-no_show',
  ]);
  expect(s.allText()).toContain('Clinic rule · First open slot from now');

  await s.press('late-after_current');
  expect(api.reinsert).toHaveBeenCalledWith(12, 'after_current');

  await s.press('arrived-A-12');
  await s.press('late-no_show');
  expect(api.markNoShow).toHaveBeenCalledWith(12);
});

test('filters to the late patients, and searches by name or token', async () => {
  const s = await renderTokens();
  await s.press('filter-late');
  expect(s.ids(/^token-[A-Z]-\d+$/)).toEqual(['token-A-12']);
  await s.press('filter-all');
  await s.type('token-search', 'priya');
  expect(s.ids(/^token-[A-Z]-\d+$/)).toEqual(['token-A-13']);
});

test('server errors are shown and the queue still reloads', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  api.callPatient.mockRejectedValue(
    new ApiError('Room 103 is busy', 409, 'ROOM_BUSY'),
  );
  const s = await renderTokens();
  api.getQueue.mockClear();
  await s.press('call-A-13');
  expect(alert).toHaveBeenCalledWith(
    'Could not update the queue',
    'Room 103 is busy',
  );
  expect(api.getQueue).toHaveBeenCalledWith(2);
});

test('switches doctor', async () => {
  const s = await renderTokens();
  await s.press('doctor-tab-3');
  expect(s.allText()).toContain('Room 105 · 1 tokens · 1 waiting');
  expect(s.ids(/^token-[A-Z]-\d+$/)).toEqual(['token-B-01']);
});

test('load failure offers "Try again"', async () => {
  getMyProfile.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderTokens();
  expect(s.textIn('tokens-error')).toContain("Can't reach the server.");
  await s.press('tokens-error-retry');
  expect(s.ids(/^token-[A-Z]-\d+$/).length).toBe(6);
});
