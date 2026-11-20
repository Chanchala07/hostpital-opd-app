// Sign-in / sign-out against the OPD backend. The role always comes from the
// account the backend finds, never from the app.

import { Platform } from 'react-native';
import type { Role, User } from '../auth/types';
import {
  ApiError,
  apiRequest,
  getSession,
  setSession,
  type TokenPair,
} from './client';

/** Roles the backend can return. */
export type ApiRole =
  | 'admin'
  | 'facility_admin'
  | 'doctor'
  | 'assistant'
  | 'patient';

export type ApiUser = {
  id: number;
  role: ApiRole;
  fullName: string;
  email: string | null;
  /** E.164, e.g. "+919876506543". */
  phone: string | null;
};

type LoginResponse = TokenPair & { user: ApiUser };

/** Shown in the account's "active sessions" list. */
const DEVICE_NAME = `OPD app · ${Platform.OS === 'ios' ? 'iOS' : 'Android'}`;

/** Backend role → which screens the app shows. Admin roles have none here. */
const APP_ROLES: Partial<Record<ApiRole, Role>> = {
  doctor: 'doctor',
  assistant: 'assistant',
  patient: 'patient',
};

/** "+919876506543" → "9876506543" */
const toMobile = (phone: string | null) =>
  (phone ?? '').replace(/\D/g, '').slice(-10);

const post = (path: string, body: object) =>
  apiRequest<LoginResponse>(path, { method: 'POST', body, auth: false });

/**
 * Signs in with email + password and returns the app user. Staff use
 * /auth/login; a patient's account is refused there, so it is retried
 * with /auth/patient/login.
 */
export async function login(email: string, password: string): Promise<User> {
  let result: LoginResponse;
  try {
    result = await post('/auth/login', {
      login: email,
      password,
      deviceName: DEVICE_NAME,
    });
  } catch (staffError) {
    if (
      !(staffError instanceof ApiError) ||
      !['STAFF_ONLY', 'INVALID_CREDENTIALS'].includes(staffError.code)
    ) {
      throw staffError;
    }
    try {
      result = await post('/auth/patient/login', {
        email,
        password,
        deviceName: DEVICE_NAME,
      });
    } catch (patientError) {
      // A patient account's own problem (e.g. deactivated) wins over the
      // staff sign-in's "incorrect" answer.
      const error =
        staffError.code === 'STAFF_ONLY' ||
        (patientError instanceof ApiError && patientError.status === 403)
          ? patientError
          : staffError;
      throw error instanceof ApiError && error.code === 'INVALID_CREDENTIALS'
        ? new ApiError(
            'Email or password is incorrect.',
            401,
            'INVALID_CREDENTIALS',
          )
        : error;
    }
  }

  const role = APP_ROLES[result.user.role];
  if (!role) {
    // Valid account, but this app has no screens for it: end that session.
    await revoke(result.refreshToken);
    throw new ApiError(
      'This app is for doctors, assistants and patients. Please use the admin portal.',
      403,
      'ROLE_NOT_SUPPORTED',
    );
  }

  setSession({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
  return {
    id: String(result.user.id),
    name: result.user.fullName,
    email: result.user.email ?? email,
    mobile: toMobile(result.user.phone),
    role,
  };
}

/** Best effort: the app signs out even if the server can't be reached. */
async function revoke(refreshToken: string) {
  await apiRequest('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    auth: false,
  }).catch(() => {});
}

/** Ends this device's session on the server and forgets the tokens. */
export async function logout(): Promise<void> {
  const current = getSession();
  setSession(null);
  if (current) {
    await revoke(current.refreshToken);
  }
}
