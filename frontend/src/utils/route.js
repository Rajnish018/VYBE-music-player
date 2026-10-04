export function routeToView(pathname) {
  if (pathname === '/discover') return 'discover';
  if (pathname === '/library') return 'library';
  if (pathname === '/favorites') return 'favorites';
  if (pathname === '/albums') return 'albums';
  if (pathname === '/settings') return 'settings';

  if (
    pathname === '/admin/artists' ||
    pathname === '/manage-artists'
  ) {
    return 'manage-artists';
  }

  if (pathname === '/manage-songs') return 'manage-songs';
  if (pathname === '/admin') return 'admin';

  return 'home';
}

export function navigateTo(
  nextRoute,
  { replace = false } = {},
) {
  const method = replace
    ? 'replaceState'
    : 'pushState';

  window.history[method](
    {},
    '',
    nextRoute,
  );
}