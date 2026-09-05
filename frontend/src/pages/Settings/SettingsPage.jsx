import './SettingsPage.css';

import ProfileSettings from './ProfileSettings';
import PlaybackSettings from './PlaybackSettings';
import AppearanceSettings from './AppearanceSettings';
import SecuritySettings from './SecuritySettings';

function SettingsPage({
  user,
  volume,
  onVolumeChange,
  theme = 'system',
  onThemeChange,
  onLogout,
}) {
  return (
    <section className="settings-page">
      <header className="page-heading compact-heading">
        <p className="eyebrow">Preferences</p>

        <h1>Settings</h1>

        <p>
          Manage your account and music player preferences.
        </p>
      </header>

      <div className="settings-stack">
        <ProfileSettings user={user} />

        <PlaybackSettings
          volume={volume}
          onVolumeChange={onVolumeChange}
        />

        <AppearanceSettings
          theme={theme}
          onThemeChange={onThemeChange || (() => {})}
        />

        <SecuritySettings
          onLogout={onLogout}
        />
      </div>
    </section>
  );
}

export default SettingsPage;