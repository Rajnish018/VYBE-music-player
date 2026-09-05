import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { authApi } from '../api';

import {
  clearStoredSession,
  STORAGE_TOKEN_KEY,
  STORAGE_USER_KEY,
  submitAuth as submitAuthHandler,
} from '../handlers/authHandlers';

function readStoredUser() {
  try {
    return JSON.parse(
      localStorage.getItem(
        STORAGE_USER_KEY,
      ) || 'null',
    );
  } catch {
    return null;
  }
}

export function useAuth({ navigate }) {
  /*
   * Restore token once when the application starts.
   */
  const [token, setToken] = useState(
    () =>
      localStorage.getItem(
        STORAGE_TOKEN_KEY,
      ) || '',
  );

  /*
   * Restore cached user once.
   */
  const [user, setUser] = useState(
    () => readStoredUser(),
  );

  /*
   * Initial authentication state.
   */
  const [sessionState, setSessionState] =
    useState(() =>
      localStorage.getItem(
        STORAGE_TOKEN_KEY,
      )
        ? 'checking'
        : 'anonymous',
    );

  const [authMode, setAuthMode] =
    useState(() =>
      window.location.pathname ===
      '/register'
        ? 'register'
        : 'login',
    );

  const [authForm, setAuthForm] =
    useState({
      email: '',
      password: '',
    });

  const [authError, setAuthError] =
    useState('');

  const [authLoading, setAuthLoading] =
    useState(false);

  /*
   * Clear the current session.
   */
  const clearSession = useCallback(() => {
    clearStoredSession();

    setToken('');
    setUser(null);
    setSessionState('anonymous');

    navigate('/login', {
      replace: true,
    });
  }, [navigate]);

  /*
   * Validate the stored token.
   *
   * This should run once for the current
   * authentication token.
   */
  useEffect(() => {
    if (!token) {
      setSessionState('anonymous');
      return undefined;
    }

    let cancelled = false;

    authApi
      .me(token)
      .then(({ user: currentUser }) => {
        if (cancelled) {
          return;
        }

        /*
         * Store the latest user information.
         */
        try {
          localStorage.setItem(
            STORAGE_USER_KEY,
            JSON.stringify(currentUser),
          );
        } catch {
          // Ignore localStorage errors.
        }

        setUser(currentUser);
        setSessionState(
          'authenticated',
        );
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        /*
         * Invalid/expired token.
         */
        if (error?.status === 401) {
          clearSession();
          return;
        }

        /*
         * Other authentication failure.
         */
        setUser(null);
        setSessionState('anonymous');
      });

    return () => {
      cancelled = true;
    };
  }, [token, clearSession]);

  /*
   * Login / Signup.
   */
  const submitAuth = useCallback(
    (
      event,
      nextAuthMode = authMode,
    ) =>
      submitAuthHandler({
        event,
        authMode: nextAuthMode,
        authForm,
        setAuthLoading,
        setAuthError,
        setAuthForm,
        setToken,
        setUser,
        setSessionState,
        navigate,
      }),
    [
      authMode,
      authForm,
      navigate,
    ],
  );

  /*
   * Login.
   */
  const submitLogin = useCallback(
    (event) =>
      submitAuth(
        event,
        'login',
      ),
    [submitAuth],
  );

  /*
   * Signup.
   */
  const submitSignup = useCallback(
    (event) =>
      submitAuth(
        event,
        'register',
      ),
    [submitAuth],
  );

  /*
   * Switch login/register mode.
   */
  const switchAuthMode = useCallback(
    () => {
      const nextMode =
        authMode === 'login'
          ? 'register'
          : 'login';

      setAuthMode(nextMode);
      setAuthError('');

      navigate(`/${nextMode}`);
    },
    [
      authMode,
      navigate,
    ],
  );

  return {
    token,

    user,

    sessionState,

    authMode,

    authForm,

    authError,

    authLoading,

    loading:
      sessionState === 'checking',

    setAuthForm,

    clearSession,

    logout: clearSession,

    submitAuth,

    submitLogin,

    submitSignup,

    switchAuthMode,
  };
}