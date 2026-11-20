/**
 * @format
 */

import React from 'react';
import { AuthContext } from '../src/auth/AuthContext';
import * as profileApi from '../src/api/profile';
import * as queueApi from '../src/api/queue';
import { AssistantDeskProvider } from '../src/screens/assistant/AssistantDeskContext';
import AssistantDashboardScreen from '../src/screens/assistant/AssistantDashboardScreen';
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

const assistant = {
  id: '7',
  name: 'Neha Patil',
  email: 'neha.patil@swapinfotech.com',
  mobile: '9876500007',
  role: 'assistant' as const,
};

beforeEach(() => {
  pinDate(NOW);
  getMyProfile.mockReset().mockResolvedValue(ASSISTANT_ME);
  api.getQueue
    .mockReset()
    .mockImplementation(async (id: number) =>
      id === 2 ? johnsonQueue() : mehtaQueue(),
    );
  for (const name of [
    'callNext',
    'recall',
    'skip',
    'reinsert',
    'callPatient',
  ]) {
    api[name].mockReset();
  }
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const renderDesk = () =>
  mount(
    <AuthContext.Provider
      value={{ user: assistant, signIn: jest.fn(), signOut: jest.fn() }}
    >
      <AssistantDeskProvider>
        <AssistantDashboardScreen
          navigation={{ navigate: jest.fn() } as never}
          route={{ key: 'Desk', name: 'Desk' } as never}
        />
      </AssistantDeskProvider>
    </AuthContext.Provider>,
  );

test('shows the live desk: stats, now serving, waiting and late patients', async () => {
  const s = await renderDesk();
  const text = s.allText();
  expect(text).toMatch(/Good morning, Neha/);
  expect(text).toContain('Desk 1');
  // Both doctors: 6 + 1 today, 2 waiting, 3 not arrived (incl. late), 1 seen.
  expect(text).toMatch(/7\nToday\n2\nWaiting\n2\nNot arrived\n1\nSeen/);
  expect(text).toMatch(/NOW SERVING\nA-11\nRohit Kulkarni/);
  expect(text).toContain('Waiting · Dr. Johnson');
  expect(s.textIn('late-card')).toContain('Amit Verma');
  expect(s.textIn('late-card')).toContain('10:15 AM slot · 20 min late');
  expect(text).toContain('On break'); // Dr. Mehta's availability
});

test('"Call next patient" calls the API and shows the server message', async () => {
  api.callNext.mockResolvedValue({
    data: null,
    message: 'A-13 called to Room 103',
  });
  const s = await renderDesk();
  await s.press('call-next');
  expect(api.callNext).toHaveBeenCalledWith(2);
  expect(s.textIn('announcement')).toBe('A-13 called to Room 103');
});

test('recall and skip act on the patient inside / the next one', async () => {
  api.recall.mockResolvedValue({ data: null, message: 'A-11 called again' });
  api.skip.mockResolvedValue({ data: null, message: 'A-13 moved back' });
  const s = await renderDesk();
  await s.press('recall');
  expect(api.recall).toHaveBeenCalledWith(11);
  // Only one waiting: skipping makes no sense.
  expect(s.isDisabled('skip-next')).toBe(true);
});

test('a late patient who arrives goes back by the clinic rule', async () => {
  api.reinsert.mockResolvedValue({
    data: null,
    message: 'A-12 is back in the queue · estimated 11:15 AM',
  });
  const s = await renderDesk();
  await s.press('arrived-A-12');
  await s.press('late-next_free_slot');
  expect(api.reinsert).toHaveBeenCalledWith(12, 'next_free_slot');
  expect(s.textIn('announcement')).toBe(
    'A-12 is back in the queue · estimated 11:15 AM',
  );
});

test('switching doctor shows that doctor’s queue', async () => {
  const s = await renderDesk();
  await s.press('doctor-tab-3');
  const text = s.allText();
  expect(text).toContain('No patient in the room');
  expect(text).toContain('Dr. Rajesh Mehta · On break');
  expect(text).toContain('Waiting · Dr. Mehta');
  expect(text).toContain('Sunil Joshi');
  expect(s.exists('late-card')).toBe(false);
});
