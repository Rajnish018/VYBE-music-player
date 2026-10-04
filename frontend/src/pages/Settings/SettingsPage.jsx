import './SettingsPage.css';

import ProfileSettings from './ProfileSettings';
import PlaybackSettings from './PlaybackSettings';
import AppearanceSettings from './AppearanceSettings';
import SecuritySettings from './SecuritySettings';
import PageHeader from '../../components/PageHeader';

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
      <PageHeader
        eyebrow="Settings"
        title="Manage your preferences"
        description="Update your profile, playback, appearance, and security settings."
      />

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