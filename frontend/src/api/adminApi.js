import { request } from './client';

export const adminApi = {
  uploadTrack(
    formData,
    token,
    signal,
  ) {
    return request(
      '/api/admin/tracks',
      {
        method: 'POST',
        body: formData,
        signal,
        timeout: 120_000,
      },
      token,
    );
  },
};