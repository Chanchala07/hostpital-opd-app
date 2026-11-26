/**
 * Backend base URL (hospital-pathalogy-backend).
 *
 * - Release builds (the APK) use the live server.
 * - Debug builds (Metro, `npm run android`) use this laptop's backend.
 *   "localhost" on a USB-connected Android phone means the phone itself, so
 *   forward the port once per connection:  adb reverse tcp:4000 tcp:4000
 *   (Android emulator: use http://10.0.2.2:4000/api/v1 instead.)
 */
export const LIVE_API_BASE_URL = 'https://api.doctorsbooking.in/api/v1';
export const LOCAL_API_BASE_URL = 'http://localhost:4000/api/v1';

export const API_BASE_URL = __DEV__ ? LOCAL_API_BASE_URL : LIVE_API_BASE_URL;

/** Give up on a request after this long. */
export const REQUEST_TIMEOUT_MS = 15000;
