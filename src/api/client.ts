// Small fetch wrapper for the OPD backend:
// - sends "Authorization: Bearer <accessToken>" on every authenticated call
// - unwraps { status, success, message, data } and turns failures into ApiError
// - on 401 TOKEN_EXPIRED, refreshes the token pair once and retries
// - when the session can't be renewed, clears it and tells the app to sign out

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status; 0 when the server couldn't be reached. */
    readonly status: number,
    /** Backend error code, e.g. "INVALID_CREDENTIALS". */
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type TokenPair = {
  accessToken: string;
  accessTokenExpiresIn: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

type Session = { accessToken: string; refreshToken: string };

// Kept in memory only: the app asks for a fresh sign-in after a restart.
let session: Session | null = null;

export const getSession = () => session;
export const setSession = (next: Session | null) => {
  session = next;
};

const expiredListeners = new Set<() => void>();

/** Called when the session ends on its own (refresh failed / token rejected). */
export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** false for sign-in / refresh calls that must not send a token. */
  auth?: boolean;
};

type Envelope = {
  success?: boolean;
  message?: string;
  code?: string;
  data?: unknown;
};

/** Response `data` plus the server's message (e.g. "A-12 checked in"). */
export type ApiResult<T> = { data: T; message: string };

async function send<T>(
  path: string,
  options: RequestOptions,
): Promise<ApiResult<T>> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth && session) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw controller.signal.aborted
      ? new ApiError(
          'The server took too long to respond. Please try again.',
          0,
          'TIMEOUT',
        )
      : new ApiError(
          "Can't reach the server. Check your connection and try again.",
          0,
          'NETWORK_ERROR',
        );
  } finally {
    clearTimeout(timer);
  }

  const payload: Envelope | null = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.message ?? `Request failed (${response.status}).`,
      response.status,
      payload?.code ?? 'HTTP_ERROR',
    );
  }
  return { data: payload?.data as T, message: payload?.message ?? '' };
}

let refreshing: Promise<void> | null = null;

/** Swaps the refresh token for a new pair. Always keep the new refresh token. */
async function refreshSession(): Promise<void> {
  const current = session;
  if (!current) {
    throw new ApiError('Not signed in.', 401, 'TOKEN_MISSING');
  }
  const { data: tokens } = await send<TokenPair>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken: current.refreshToken },
    auth: false,
  });
  session = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

function endSession(): ApiError {
  session = null;
  expiredListeners.forEach(listener => listener());
  return new ApiError(
    'Your session has expired. Please sign in again.',
    401,
    'SESSION_EXPIRED',
  );
}

/** Calls the API and returns the response's `data`. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  return (await apiCall<T>(path, options)).data;
}

/** Like apiRequest, but also returns the server's message (for desk actions). */
export async function apiCall<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const authenticated = options.auth !== false;
  try {
    return await send<T>(path, options);
  } catch (error) {
    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !authenticated
    ) {
      throw error;
    }
    if (error.code !== 'TOKEN_EXPIRED' || !session) {
      throw endSession(); // token rejected: sign out
    }
  }

  // Access token expired: refresh once (shared by parallel calls), then retry.
  try {
    if (!refreshing) {
      refreshing = refreshSession().finally(() => {
        refreshing = null;
      });
    }
    await refreshing;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw endSession();
    }
    throw error; // e.g. offline: keep the session, let the caller retry
  }
  return send<T>(path, options);
}
