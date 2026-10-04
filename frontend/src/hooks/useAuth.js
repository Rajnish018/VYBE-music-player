import {
  useCallback,
  useState,
} from 'react';

import { useAppStore } from '../store/appStore';

export function useAuth({ navigate }) {
  const token = useAppStore(
    (state) => state.token,
  );
  const user = useAppStore(
    (state) => state.user,
  );
  const sessionState = useAppStore(
    (state) => state.sessionState,
  );
  const authError = useAppStore(
    (state) => state.authError,
  );
  const authLoading = useAppStore(
    (state) => state.authLoading,
  );
  const initializing = useAppStore(
    (state) => state.initializing,
  );
  const initialized = useAppStore(
    (state) => state.initialized,
  );
  const authenticate = useAppStore(
    (state) => state.authenticate,
  );
  const clearSessionState = useAppStore(
    (state) => state.clearSessionState,
  );
  const setAuthError = useAppStore(
    (state) => state.setAuthError,
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

  const clearSession = useCallback(() => {
    clearSessionState();

    navigate('/login', {
      replace: true,
    });
  }, [
    clearSessionState,
    navigate,
  ]);

  const submitAuth = useCallback(
    async (
      event,
      nextAuthMode = authMode,
    ) => {
      event.preventDefault();

      try {
        const data =
          await authenticate({
            authMode: nextAuthMode,
            authForm,
          });

        setAuthForm({
          email: '',
          password: '',
        });

        navigate(
          data.user?.role === 'ADMIN'
            ? '/admin'
            : '/dashboard',
        );
      } catch {
        // The store owns authError.
      }
    },
    [
      authMode,
      authForm,
      authenticate,
      navigate,
    ],
  );

  const submitLogin = useCallback(
    (event) =>
      submitAuth(
        event,
        'login',
      ),
    [submitAuth],
  );

  const submitSignup = useCallback(
    (event) =>
      submitAuth(
        event,
        'register',
      ),
    [submitAuth],
  );

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
      setAuthError,
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
      initializing ||
      (!initialized &&
        sessionState === 'checking'),

    setAuthForm,
    clearSession,
    logout: clearSession,
    submitAuth,
    submitLogin,
    submitSignup,
    switchAuthMode,
  };
}
