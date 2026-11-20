/**
 * Backend base URL (hospital-pathalogy-backend).
 *
 * "localhost" on a USB-connected Android phone means the phone itself, so
 * forward the port once per connection:  adb reverse tcp:4000 tcp:4000
 * (Android emulator: use http://10.0.2.2:4000/api/v1 instead.)
 */
export const API_BASE_URL = 'http://localhost:4000/api/v1';

/** Give up on a request after this long. */
export const REQUEST_TIMEOUT_MS = 15000;
