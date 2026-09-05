import { request } from './client';

export const authApi = {
  login(credentials, signal) {
    return request(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
        signal,
      },
    );
  },

  register(credentials, signal) {
    return request(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(credentials),
        signal,
      },
    );
  },

  me(token, signal) {
    return request(
      '/api/auth/me',
      {
        signal,
      },
      token,
    );
  },

  logout(token, signal) {
    return request(
      '/api/auth/logout',
      {
        method: 'POST',
        signal,
      },
      token,
    );
  },
};
