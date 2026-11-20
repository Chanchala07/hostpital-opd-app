import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import { login, logout } from '../api/auth';
import { onSessionExpired } from '../api/client';
import { stopPush } from '../notifications/push';
import type { User } from './types';

type AuthContextValue = {
  user: User | null;
  /** Throws an Error with a message to show when sign-in fails. */
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Signed-in user for the whole app. RootNavigator picks the screens from
 * `user.role`, which comes from the backend account.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const signedIn = useRef(false);
  /** The last sign-out, still talking to the server. */
  const signingOut = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    signedIn.current = user != null;
  }, [user]);

  // The token couldn't be renewed (expired / revoked): back to sign-in.
  useEffect(
    () =>
      onSessionExpired(() => {
        if (!signedIn.current) {
          return; // already signed out
        }
        signedIn.current = false;
        setUser(null);
        Alert.alert('Session expired', 'Please sign in again.');
      }),
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      signIn: async (email, password) => {
        await signingOut.current; // the previous session ends first
        setUser(await login(email, password));
      },
      signOut: () => {
        signedIn.current = false;
        setUser(null);
        // Stop pushes to this phone while the session still works, then
        // revoke it on the server. Both in the background.
        signingOut.current = stopPush().then(logout, logout);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
