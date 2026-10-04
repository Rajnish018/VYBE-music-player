function Icon({ name }) {
  const icons = {
    home: (
      <path d="M3 10.8 12 3l9 7.8V21h-6v-6H9v6H3z" />
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4.2-4.2" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </>
    ),
    library: (
      <>
        <path d="M5 4h4v16H5zM10 4h4v16h-4z" />
        <path d="m16 5 3 14" />
      </>
    ),
    album: (
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    heart: (
      <path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 21l8.8-8a5.2 5.2 0 0 0 0-7.4z" />
    ),
    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M4 20h16" />
      </>
    ),
    previous: (
      <>
        <path d="M19 20 9 12l10-8z" />
        <path d="M5 19V5" />
      </>
    ),
    next: (
      <>
        <path d="m5 4 10 8-10 8z" />
        <path d="M19 5v14" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7z" />,
    pause: (
      <>
        <path d="M7 5h4v14H7z" />
        <path d="M13 5h4v14h-4z" />
      </>
    ),
    volume: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </>
    ),
    mute: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="m17 9 4 4m0-4-4 4" />
      </>
    ),
    loader: (
      <>
        <path d="M21 12a9 9 0 1 1-6.2-8.6" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6" />
        <path d="m10 14 10-10" />
        <path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" />
      </>
    ),
    settings: (
      <>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9.6 19a1.65 1.65 0 0 0-1-1.51V17a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 .6 15a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0 1-1.51V7a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 14.4 9a1.65 1.65 0 0 0 1-1.51V7a2 2 0 1 1 4 0v.09c0 .63.38 1.2.93 1.45z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </>
    ),
    check: <path d="m5 13 4 4L19 7" />,
    shuffle: (
      <>
        <path d="m18 4 3 3-3 3" />
        <path d="M3 7h5.5a4 4 0 0 1 3.3 1.7L15.2 14a4 4 0 0 0 3.3 1.7H21" />
        <path d="m18 20 3-3-3-3" />
        <path d="M3 17h5.5a4 4 0 0 0 3.3-1.7l.3-.4" />
        <path d="M13.5 8.7 14 8" />
      </>
    ),
    repeat: (
      <>
        <path d="M17 1l4 4-4 4" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <path d="M7 23l-4-4 4-4" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </>
    ),
    moon: (
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4 7 7 0 0 0 20 14.5z" />
    ),
    wifi: (
      <>
        <path d="M2 8.5a16 16 0 0 1 20 0" />
        <path d="M5.5 12a11 11 0 0 1 13 0" />
        <path d="M9 15.5a6 6 0 0 1 6 0" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    logout: (
      <>
        <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
        <path d="M16 17l5-5-5-5" />
        <path d="M21 12H9" />
      </>
    ),
    close: (
      <>
        <path d="M18 6 6 18" />
        <path d="M6 6l12 12" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    minus: <path d="M5 12h14" />,
    edit: (
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>
),
download: (
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </>
),
  };

  return (
    <svg
      className={name === 'loader' ? 'icon spin' : 'icon'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

export default Icon;
