/**
 * @format
 */

import React from 'react';
import { Alert } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import * as authApi from '../src/api/auth';
import * as client from '../src/api/client';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import type { User } from '../src/auth/types';
import * as push from '../src/notifications/push';
import { unmountAll } from '../test-utils/render';

jest.mock('../src/api/auth', () => ({
  login: jest.fn(),
  logout: jest.fn(),
  registerPatient: jest.fn(),
}));
jest.mock('../src/api/client', () => ({ onSessionExpired: jest.fn() }));
jest.mock('../src/notifications/push', () => ({ stopPush: jest.fn() }));

const login = authApi.login as jest.Mock;
const logout = authApi.logout as jest.Mock;
const registerPatient = authApi.registerPatient as jest.Mock;
const stopPush = push.stopPush as jest.Mock;
const onSessionExpired = client.onSessionExpired as jest.Mock;

const SARAH: User = {
  id: '2',
  name: 'Dr. Sarah Johnson',
  email: 'sarah@example.com',
  mobile: '9876500002',
  role: 'doctor',
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

let auth!: ReturnType<typeof useAuth>;
function Probe() {
  auth = useAuth();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  login.mockResolvedValue(SARAH);
  logout.mockResolvedValue(undefined);
  stopPush.mockResolvedValue(undefined);
  onSessionExpired.mockReturnValue(() => {});
});

afterEach(async () => {
  await unmountAll();
  jest.restoreAllMocks();
});

async function renderAuth() {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  return renderer;
}

const act = (fn: () => unknown) =>
  ReactTestRenderer.act(async () => {
    await fn();
  });

test('sign-out stops push to this phone before the session is revoked', async () => {
  const renderer = await renderAuth();
  await act(() => auth.signIn('sarah@example.com', 'secret'));
  expect(auth.user?.name).toBe('Dr. Sarah Johnson');

  const removing = deferred();
  stopPush.mockReturnValue(removing.promise);
  await act(() => auth.signOut());
  expect(auth.user).toBeNull(); // the app signs out at once
  expect(stopPush).toHaveBeenCalledTimes(1);
  expect(logout).not.toHaveBeenCalled(); // the session is still needed

  // Signing in again waits for the old session to end first.
  let signedIn = false;
  const again = auth.signIn('sarah@example.com', 'secret').then(() => {
    signedIn = true;
  });
  await act(() => Promise.resolve());
  expect(login).toHaveBeenCalledTimes(1);

  await act(async () => {
    removing.resolve();
    await again;
  });
  expect(logout).toHaveBeenCalledTimes(1);
  expect(logout.mock.invocationCallOrder[0]).toBeLessThan(
    login.mock.invocationCallOrder[1],
  );
  expect(signedIn).toBe(true);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a new patient is signed in once their account is created', async () => {
  const ritu: User = {
    id: '40',
    name: 'Ritu Sharma',
    email: null,
    mobile: '9876543210',
    role: 'patient',
  };
  registerPatient.mockResolvedValue(ritu);
  const account = {
    fullName: 'Ritu Sharma',
    phone: '9876543210',
    dateOfBirth: '1990-08-15',
    gender: 'female' as const,
    email: null,
    password: 'Sunrise@2026',
  };
  const renderer = await renderAuth();
  await act(() => auth.signUp(account));
  expect(registerPatient).toHaveBeenCalledWith(account);
  expect(auth.user).toEqual(ritu);

  // A failed sign-up leaves the app signed out and passes the error on.
  await act(() => auth.signOut());
  registerPatient.mockRejectedValue(
    new Error('This number already has an account.'),
  );
  let failure: unknown;
  await act(() =>
    auth.signUp(account).catch(e => {
      failure = e;
    }),
  );
  expect(failure).toEqual(new Error('This number already has an account.'));
  expect(auth.user).toBeNull();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('an expired session signs out with a message, once', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const renderer = await renderAuth();
  const expired = onSessionExpired.mock.calls[0][0] as () => void;
  await act(() => auth.signIn('sarah@example.com', 'secret'));

  await act(() => expired());
  expect(auth.user).toBeNull();
  expect(alert).toHaveBeenCalledWith(
    'Session expired',
    'Please sign in again.',
  );
  expect(stopPush).not.toHaveBeenCalled(); // no session left to call with

  // e.g. a late request failing after sign-out: no second message.
  await act(() => expired());
  expect(alert).toHaveBeenCalledTimes(1);
  await ReactTestRenderer.act(async () => renderer.unmount());
});
