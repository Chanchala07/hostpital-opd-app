/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import * as api from '../src/api/myPrescriptions';
import MyPrescriptionsScreen from '../src/screens/patient/MyPrescriptionsScreen';
import { NOW } from '../test-utils/fixtures';
import { myRx, PARACETAMOL } from '../test-utils/prescriptions';
import { flush, mount, pinDate, unmountAll } from '../test-utils/render';

jest.mock('../src/api/myPrescriptions', () => ({
  ...jest.requireActual('../src/api/myPrescriptions'),
  listMyPrescriptions: jest.fn(),
}));

const list = api.listMyPrescriptions as jest.Mock;

const GASTRITIS = myRx({
  id: 32,
  rxCode: 'RX-3381',
  date: '2026-08-12',
  diagnosis: 'Gastritis',
  followUpDate: null,
  doctor: { id: 3, fullName: 'Dr. Rajesh Mehta', departmentName: null },
  medicines: [{ ...PARACETAMOL, durationDays: 14 }],
});
const LAST_YEAR = myRx({
  id: 33,
  rxCode: 'RX-2210',
  date: '2025-12-02',
  diagnosis: null,
  complaint: 'Sneezing, runny nose',
  medicines: [],
});

beforeEach(() => {
  pinDate(NOW);
  list.mockReset().mockResolvedValue([myRx(), GASTRITIS, LAST_YEAR]);
});

afterEach(async () => {
  await unmountAll();
  jest.useRealTimers();
});

async function renderList() {
  const navigation = {
    navigate: jest.fn(),
    addListener: jest.fn(() => () => {}),
  };
  const s = await mount(
    <MyPrescriptionsScreen
      navigation={navigation as never}
      route={{ key: 'Prescriptions', name: 'Prescriptions' } as never}
    />,
  );
  const listProps = () => s.byId('prescription-list').props;
  const endReached = async () => {
    await ReactTestRenderer.act(async () => {
      listProps().onEndReached();
    });
    await flush();
  };
  return { ...s, navigation, listProps, endReached };
}

test('lists every prescription, newest first, by year', async () => {
  const s = await renderList();
  expect(list).toHaveBeenCalledWith(1);
  expect(s.ids(/^rx-\d+$/)).toEqual(['rx-31', 'rx-32', 'rx-33']);
  expect(s.allText()).toMatch(
    /2026[\s\S]*Viral fever[\s\S]*Gastritis[\s\S]*2025/,
  );

  const latest = s.textIn('rx-31');
  expect(latest).toContain('16\nNOV');
  expect(latest).toContain('Dr. Sarah Johnson · General Medicine');
  expect(latest).toContain('Paracetamol 650 mg, Cetirizine 10 mg +1 more');
  expect(latest).toContain('Ongoing'); // medicines run till 20 Nov
  expect(latest).toContain('RX-3502');
  expect(latest).not.toContain('For ');

  const old = s.textIn('rx-32');
  expect(old).toContain('Dr. Rajesh Mehta');
  expect(old).not.toContain('Ongoing');
  // no diagnosis: what the visit was for; no medicines: says so
  expect(s.textIn('rx-33')).toMatch(/Sneezing, runny nose[\s\S]*No medicines/);
});

test('tapping one opens it; back goes home', async () => {
  const s = await renderList();
  await s.press('rx-32');
  expect(s.navigation.navigate).toHaveBeenCalledWith('Prescription', {
    prescriptionId: 32,
  });
  await s.press('back');
  expect(s.navigation.navigate).toHaveBeenCalledWith('Home');
});

test('family and several clinics: says who it was for and where', async () => {
  list.mockResolvedValue([
    myRx(),
    myRx({
      id: 40,
      patient: { id: 112, patientCode: 'PT-20112', fullName: 'Aarav Verma' },
      facility: { id: 2, name: 'Lakeview Clinic, Baner' },
    }),
  ]);
  const s = await renderList();
  expect(s.textIn('rx-31')).toContain('For Amit Verma');
  expect(s.textIn('rx-40')).toContain('For Aarav Verma');
  expect(s.textIn('rx-40')).toContain(
    'Dr. Sarah Johnson · General Medicine · Lakeview Clinic, Baner',
  );
});

test('loads the next page at the end of the list, until there are no more', async () => {
  const page1 = Array.from({ length: api.MY_PRESCRIPTIONS_PAGE }, (_, i) =>
    myRx({ id: 100 + i }),
  );
  list.mockResolvedValueOnce(page1);
  const { ApiError } = jest.requireActual('../src/api/client');
  list.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderList();
  expect(s.listProps().data).toHaveLength(20);

  await s.endReached();
  expect(list).toHaveBeenLastCalledWith(2);
  expect(s.textIn('load-more-retry')).toContain("Couldn't load more");

  list.mockResolvedValueOnce([myRx({ id: 200 }), GASTRITIS]);
  await s.press('load-more-retry');
  expect(list).toHaveBeenLastCalledWith(2);
  expect(s.listProps().data).toHaveLength(22);
  expect(s.exists('load-more-retry')).toBe(false);

  // a short page was the last one
  const calls = list.mock.calls.length;
  await s.endReached();
  expect(list).toHaveBeenCalledTimes(calls);
});

test('coming back to the tab picks up new prescriptions quietly', async () => {
  const s = await renderList();
  const onFocus = (s.navigation.addListener.mock.calls as unknown[][]).find(
    c => c[0] === 'focus',
  )![1] as () => void;
  await ReactTestRenderer.act(async () => onFocus()); // first focus = first load
  expect(list).toHaveBeenCalledTimes(1);

  list.mockResolvedValue([myRx({ id: 50, diagnosis: 'Migraine' }), myRx()]);
  await ReactTestRenderer.act(async () => onFocus());
  await flush();
  expect(list).toHaveBeenCalledTimes(2);
  expect(s.exists('loading')).toBe(false);
  expect(s.ids(/^rx-\d+$/)).toEqual(['rx-50', 'rx-31']);
});

test('no prescriptions yet: explains, and offers booking', async () => {
  list.mockResolvedValue([]);
  const s = await renderList();
  expect(s.textIn('no-prescriptions')).toContain('No prescriptions yet');
  await s.press('book-now');
  expect(s.navigation.navigate).toHaveBeenCalledWith('BookAppointment');
});

test('load failure offers "Try again"', async () => {
  const { ApiError } = jest.requireActual('../src/api/client');
  list.mockRejectedValueOnce(
    new ApiError("Can't reach the server.", 0, 'NETWORK_ERROR'),
  );
  const s = await renderList();
  expect(s.textIn('load-error')).toContain("Can't reach the server.");
  await s.press('load-error-retry');
  expect(s.ids(/^rx-\d+$/)).toHaveLength(3);
});
