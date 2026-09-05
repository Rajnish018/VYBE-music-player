function SecuritySettings({ onLogout }) {
  return (
    <section className="settings-card">
      <div className="settings-card-heading">
        <h2>Security</h2>
        <p>Manage your current session.</p>
      </div>

      <div className="settings-row">
        <div>
          <strong>Sign out</strong>
          <span>Sign out of your Aura account on this device.</span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="danger-button"
        >
          Sign out
        </button>
      </div>
    </section>
  );
}

export default SecuritySettings;
