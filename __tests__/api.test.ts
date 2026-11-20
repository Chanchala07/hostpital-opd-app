/**
 * @format
 */

import { login, logout } from '../src/api/auth';
import { registerDevice, removeDevice } from '../src/api/devices';
import { getVisit, savePrescription } from '../src/api/visits';
import {
  ApiError,
  apiRequest,
  getSession,
  onSessionExpired,
  setSession,
} from '../src/api/client';

const BASE = 'http://localhost:4000/api/v1';

type Reply = { status: number; body: unknown } | Error;
let replies: Reply[];
let calls: { url: string; init: RequestInit }[];

beforeEach(() => {
  replies = [];
  calls = [];
  setSession(null);
  globalThis.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = replies.shift();
    if (!next) {
      throw new Error(`Unexpected request to ${String(url)}`);
    }
    if (next instanceof Error) {
      throw next;
    }
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    } as Response;
  }) as typeof fetch;
});

const ok = (data: unknown) => ({
  status: 200,
  body: { status: 200, success: true, message: 'OK', data },
});
const fail = (status: number, code: string, message = code) => ({
  status,
  body: { status, success: false, code, message },
});
const headersOf = (i: number) =>
  calls[i].init.headers as Record<string, string>;
const bodyOf = (i: number) => JSON.parse(String(calls[i].init.body));

const TOKENS = {
  accessToken: 'access-1',
  accessTokenExpiresIn: '15m',
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: '2026-12-01T00:00:00.000Z',
};
const SARAH = {
  id: 2,
  role: 'doctor',
  fullName: 'Dr. Sarah Johnson',
  email: 'sarah.johnson@swapinfotech.com',
  phone: '+919876506543',
  employeeId: 'EMP-1021',
};

describe('login', () => {
  test('a doctor signs in with the staff API and gets the doctor role', async () => {
    replies.push(ok({ ...TOKENS, user: SARAH }));
    const user = await login('sarah.johnson@swapinfotech.com', 'Doctor@123');

    expect(user).toEqual({
      id: '2',
      name: 'Dr. Sarah Johnson',
      email: 'sarah.johnson@swapinfotech.com',
      mobile: '9876506543',
      role: 'doctor',
    });
    expect(calls[0].url).toBe(`${BASE}/auth/login`);
    expect(calls[0].init.method).toBe('POST');
    expect(bodyOf(0)).toEqual({
      login: 'sarah.johnson@swapinfotech.com',
      password: 'Doctor@123',
      deviceName: expect.stringMatching(/^OPD app · /),
    });
    expect(headersOf(0).Authorization).toBeUndefined();
    expect(getSession()).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
  });

  test('an assistant gets the assistant role', async () => {
    replies.push(
      ok({
        ...TOKENS,
        user: { ...SARAH, id: 7, role: 'assistant', fullName: 'Neha Patil' },
      }),
    );
    const user = await login('neha.patil@swapinfotech.com', 'Assistant@123');
    expect(user).toMatchObject({
      id: '7',
      name: 'Neha Patil',
      role: 'assistant',
    });
  });

  test('a patient account falls back to the patient login', async () => {
    replies.push(
      fail(403, 'STAFF_ONLY', 'Use the patient app to sign in'),
      ok({
        ...TOKENS,
        user: {
          id: 31,
          role: 'patient',
          fullName: 'Ritu Sharma',
          phone: '+919876543210',
          email: 'ritu@gmail.com',
        },
        profiles: [],
      }),
    );
    const user = await login('ritu@gmail.com', '123456');
    expect(user).toMatchObject({ name: 'Ritu Sharma', role: 'patient' });
    expect(calls[1].url).toBe(`${BASE}/auth/patient/login`);
    expect(bodyOf(1)).toMatchObject({
      email: 'ritu@gmail.com',
      password: '123456',
    });
  });

  test('a wrong password shows one clear message and keeps no session', async () => {
    replies.push(
      fail(
        401,
        'INVALID_CREDENTIALS',
        'Email / employee ID or password is incorrect',
      ),
      fail(
        401,
        'INVALID_CREDENTIALS',
        'Mobile number / email or password is incorrect',
      ),
    );
    await expect(
      login('sarah.johnson@swapinfotech.com', 'nope'),
    ).rejects.toThrow('Email or password is incorrect.');
    expect(getSession()).toBeNull();
  });

  test('server messages are shown as they are', async () => {
    replies.push(
      fail(
        403,
        'INVITE_PENDING',
        'Set your password using the invite link first',
      ),
    );
    await expect(login('new.doctor@swapinfotech.com', 'x')).rejects.toThrow(
      'Set your password using the invite link first',
    );
    expect(calls).toHaveLength(1);
  });

  test('admin accounts are refused and their new session is revoked', async () => {
    replies.push(
      ok({ ...TOKENS, user: { ...SARAH, role: 'facility_admin' } }),
      ok(undefined),
    );
    await expect(login('meera.kulkarni@swapinfotech.com', 'x')).rejects.toThrow(
      /admin portal/,
    );
    expect(calls[1].url).toBe(`${BASE}/auth/logout`);
    expect(bodyOf(1)).toEqual({ refreshToken: 'refresh-1' });
    expect(getSession()).toBeNull();
  });

  test('no connection gives a friendly message', async () => {
    replies.push(new TypeError('Network request failed'));
    const error = await login('a@b.com', 'x').catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toMatch(/Can't reach the server/);
  });
});

describe('authenticated requests', () => {
  beforeEach(() => {
    setSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  test('send "Authorization: Bearer <accessToken>" and return data', async () => {
    replies.push(ok({ fullName: 'Dr. Sarah Johnson' }));
    await expect(apiRequest('/auth/me')).resolves.toEqual({
      fullName: 'Dr. Sarah Johnson',
    });
    expect(headersOf(0).Authorization).toBe('Bearer access-1');
  });

  test('an expired token is refreshed once, then the call is retried', async () => {
    replies.push(
      fail(401, 'TOKEN_EXPIRED'),
      ok({ ...TOKENS, accessToken: 'access-2', refreshToken: 'refresh-2' }),
      ok({ items: [] }),
    );
    await expect(apiRequest('/appointments')).resolves.toEqual({ items: [] });
    expect(calls.map(c => c.url)).toEqual([
      `${BASE}/appointments`,
      `${BASE}/auth/refresh`,
      `${BASE}/appointments`,
    ]);
    expect(bodyOf(1)).toEqual({ refreshToken: 'refresh-1' });
    expect(headersOf(1).Authorization).toBeUndefined();
    expect(headersOf(2).Authorization).toBe('Bearer access-2');
    expect(getSession()?.refreshToken).toBe('refresh-2');
  });

  test('when the refresh is refused, the app is signed out', async () => {
    const expired = jest.fn();
    const unsubscribe = onSessionExpired(expired);
    replies.push(fail(401, 'TOKEN_EXPIRED'), fail(401, 'REFRESH_REUSED'));
    await expect(apiRequest('/appointments')).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(getSession()).toBeNull();
    unsubscribe();
  });

  test('logout revokes the refresh token and forgets the session', async () => {
    replies.push(ok(undefined));
    await logout();
    expect(calls[0].url).toBe(`${BASE}/auth/logout`);
    expect(bodyOf(0)).toEqual({ refreshToken: 'refresh-1' });
    expect(getSession()).toBeNull();
  });
});

describe('push devices', () => {
  beforeEach(() => {
    setSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  test('registers this phone’s FCM token for the signed-in user', async () => {
    replies.push(ok(null));
    await registerDevice('fcm:token-1');
    expect(calls[0].url).toBe(`${BASE}/devices`);
    expect(calls[0].init.method).toBe('POST');
    expect(headersOf(0).Authorization).toBe('Bearer access-1');
    expect(bodyOf(0)).toEqual({
      token: 'fcm:token-1',
      platform: 'ios', // Jest runs as iOS
      deviceName: 'OPD app · iOS',
    });
  });

  test('removes it on sign-out', async () => {
    replies.push(ok(null));
    await removeDevice('fcm:token/1');
    expect(calls[0].url).toBe(`${BASE}/devices/fcm%3Atoken%2F1`);
    expect(calls[0].init.method).toBe('DELETE');
  });
});

describe('prescription', () => {
  beforeEach(() => {
    setSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  test('opens the visit and saves the draft (the whole list)', async () => {
    replies.push(ok({ id: 77 }), ok({ id: 77 }));
    await getVisit(77);
    expect(calls[0].url).toBe(`${BASE}/visits/77`);
    expect(calls[0].init.method).toBe('GET');

    const items = [
      {
        medicineName: 'Paracetamol',
        form: 'Tablet',
        strength: '650 mg',
        frequency: '1-0-1',
        durationDays: 5,
        timing: 'After food',
        instructions: null,
      },
    ];
    await savePrescription(77, items);
    expect(calls[1].url).toBe(`${BASE}/visits/77/prescription`);
    expect(calls[1].init.method).toBe('PUT');
    expect(bodyOf(1)).toEqual({ items });
  });
});
