/**
 * @format
 */

import React from 'react';
import { Share } from 'react-native';
import * as api from '../src/api/myPrescriptions';
import PrescriptionScreen from '../src/screens/patient/PrescriptionScreen';
import { NOW } from '../test-utils/fixtures';
import { myRxDetail, PARACETAMOL } from '../test-utils/prescriptions';
import { mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/myPrescriptions', () => ({
  ...jest.requireActual('../src/api/myPrescriptions'),
  getMyPrescription: jest.fn(),
}));

const getOne = api.getMyPrescription as jest.Mock;

beforeEach(() => {
  pinDate(NOW);
  getOne.mockReset().mockResolvedValue(myRxDetail());
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function renderRx() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const s = await mount(
    <PrescriptionScreen
      navigation={navigation as never}
      route={
        {
          key: 'Prescription',
          name: 'Prescription',
          params: { prescriptionId: 31 },
        } as never
      }
    />,
  );
  return { ...s, navigation };
}

test('shows the visit, every medicine with its doses, advice and follow-up', async () => {
  const s = await renderRx();
  expect(getOne).toHaveBeenCalledWith(31);
  expect(s.allText()).toContain('16 Nov 2026 · RX-3502');

  const visit = s.textIn('rx-visit');
  expect(visit).toContain('Dr. Sarah Johnson');
  expect(visit).toContain('General Medicine · MBBS, MD (Medicine)');
  expect(visit).toContain('Sunrise Clinic, Kothrud · Token A-12');
  expect(visit).toMatch(/Diagnosis\nViral fever\nTemp\n100\.8°F\nBP\n118\/78/);
  expect(visit).toContain('Fever, body ache · 2 days');
  expect(visit).toContain('Amit Verma · PT-20111');

  expect(s.allText()).toContain('Medicines (3)');
  expect(s.textIn('course-status')).toBe('Ongoing · till Fri, 20 Nov');
  expect(s.textIn('medicine-0')).toBe(
    'Paracetamol 650 mg\nTablet\n5 days\nAfter food\nMorning\n1\nAfternoon\n—\nNight\n1',
  );
  expect(s.textIn('medicine-1')).toBe(
    'Cetirizine 10 mg\nTablet · May cause drowsiness\n3 days\nBedtime\nMorning\n—\nAfternoon\n—\nNight\n1',
  );
  expect(s.textIn('medicine-2')).toMatch(/Morning\n½\nAfternoon\n—\nNight\n½/);

  expect(s.textIn('rx-advice')).toMatch(
    /Fluids, rest 3 days\nTests advised\n•\nCBC/,
  );
  expect(s.textIn('follow-up')).toContain(
    'Book your visit with Dr. Sarah Johnson',
  );
  await s.press('book-follow-up');
  expect(s.navigation.navigate).toHaveBeenCalledWith('BookAppointment');

  // The old sample-only parts are gone.
  expect(s.allText()).not.toContain('Reminders');
  expect(s.allText()).not.toContain("Today's doses");
});

test('an old prescription: course ended, follow-up passed, nothing extra', async () => {
  getOne.mockResolvedValue(
    myRxDetail({
      date: '2026-08-12',
      followUpDate: '2026-08-20',
      advice: null,
      testsAdvised: [],
      vitals: null,
      token: null,
      medicines: [{ ...PARACETAMOL, durationDays: 14 }],
    }),
  );
  const s = await renderRx();
  expect(s.textIn('course-status')).toMatch(/^Course ended \w{3}, 25 Aug$/);
  expect(s.textIn('rx-visit')).toMatch(/Temp\n—\nBP\n—/);
  expect(s.textIn('rx-visit')).not.toContain('Token');
  expect(s.exists('follow-up')).toBe(false);
  expect(s.exists('rx-advice')).toBe(false);
});

test('no medicines at that visit', async () => {
  getOne.mockResolvedValue(myRxDetail({ medicines: [] }));
  const s = await renderRx();
  expect(s.allText()).toContain('Medicines (0)');
  expect(s.allText()).toContain('No medicines were prescribed at this visit.');
  expect(s.exists('course-status')).toBe(false);
});

test('share sends the prescription as text; back goes back', async () => {
  const shareSpy = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
  const s = await renderRx();
  await s.press('share');
  const { message } = shareSpy.mock.calls[0][0] as { message: string };
  expect(message).toContain('Prescription RX-3502 · 16 Nov 2026');
  expect(message).toContain('Dr. Sarah Johnson (General Medicine)');
  expect(message).toContain('• Paracetamol 650 mg: 1-0-1, 5 days, after food');
  expect(message).toContain(
    '• Cetirizine 10 mg: 0-0-1, 3 days, bedtime, May cause drowsiness',
  );
  expect(message).toContain('Tests: CBC');
  expect(message).toContain('Follow-up: Sat, 21 Nov');

  await s.press('back');
  expect(s.navigation.goBack).toHaveBeenCalled();
});

test('load failure offers "Try again"', async () => {
  const { ApiError } = jest.requireActual('../src/api/client');
  getOne.mockRejectedValueOnce(
    new ApiError('Prescription not found', 404, 'NOT_FOUND'),
  );
  const s = await renderRx();
  expect(s.textIn('load-error')).toContain('Prescription not found');
  await s.press('load-error-retry');
  expect(s.exists('rx-visit')).toBe(true);
});
