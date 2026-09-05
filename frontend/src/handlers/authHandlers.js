import { authApi } from '../api';

export const STORAGE_TOKEN_KEY = 'aura.authToken';
export const STORAGE_USER_KEY = 'aura.user';

export async function submitAuth({
  event,
  authMode,
  authForm,
  setAuthLoading,
  setAuthError,
  setAuthForm,
  setToken,
  setUser,
  setSessionState,
  navigate,
}) {
  event.preventDefault();
  setAuthLoading(true);
  setAuthError('');

  try {
    const data = await (authMode === 'login' ? authApi.login(authForm) : authApi.register(authForm));
    localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
    localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    setSessionState('authenticated');
    navigate(data.user.role === 'ADMIN' ? '/admin' : '/dashboard');
    setAuthForm({ email: '', password: '' });
  } catch (error) {
    setAuthError(error.message || 'Authentication failed.');
  } finally {
    setAuthLoading(false);
  }
}

export function clearStoredSession() {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_USER_KEY);
}
