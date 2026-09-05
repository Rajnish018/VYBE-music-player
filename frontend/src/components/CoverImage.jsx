import { useMemo, useState } from 'react';
import { API_BASE_URL } from '../api';
import Icon from './Icons';

function resolveCoverUrl(src, token) {
  if (!src) {
    return '';
  }

  const isAbsolute =
    /^https?:\/\//i.test(src);

  const url = new URL(
    isAbsolute ? src : `${API_BASE_URL}/${String(src).replace(/^\/+/, '')}`,
  );

  if (
    token &&
    url.origin === new URL(API_BASE_URL).origin &&
    url.pathname.includes('/api/tracks/') &&
    url.pathname.endsWith('/cover')
  ) {
    url.searchParams.set('token', token);
  }

  return url.toString();
}

function CoverImage({
  src,
  token,
  className = '',
}) {
  const [failedSrc, setFailedSrc] = useState('');

  const resolvedSrc = useMemo(
    () => resolveCoverUrl(src, token),
    [src, token],
  );

  if (!resolvedSrc || failedSrc === resolvedSrc) {
    return (
      <span
        className={`cover-fallback ${className}`.trim()}
        aria-hidden="true"
      >
        <Icon name="library" />
      </span>
    );
  }

  return (
    <img
      className={className}
      src={resolvedSrc}
      alt=""
      onError={() => setFailedSrc(resolvedSrc)}
    />
  );
}

export default CoverImage;
