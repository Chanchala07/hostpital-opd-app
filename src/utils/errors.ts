import { ApiError } from '../api/client';

/** Server messages are shown as-is; app bugs get a plain fallback. */
export function userMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (__DEV__) {
    console.warn(fallback, error);
  }
  return fallback;
}
