// This phone's FCM token, so the server can send push notifications to the
// signed-in user. A token belongs to the last user who registered it.

import { Platform } from 'react-native';
import { apiRequest } from './client';

export type DevicePlatform = 'android' | 'ios';

/** Shown in the server's device list, e.g. "OPD app · V2420". */
export function deviceName(): string {
  const model =
    Platform.OS === 'android'
      ? (Platform.constants as { Model?: string }).Model
      : undefined;
  return `OPD app · ${model || (Platform.OS === 'ios' ? 'iOS' : 'Android')}`;
}

export const registerDevice = (token: string) =>
  apiRequest<null>('/devices', {
    method: 'POST',
    body: {
      token,
      platform: (Platform.OS === 'ios' ? 'ios' : 'android') as DevicePlatform,
      deviceName: deviceName(),
    },
  });

export const removeDevice = (token: string) =>
  apiRequest<null>(`/devices/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });
