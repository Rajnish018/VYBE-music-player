function AppearanceSettings({
  theme,
  onThemeChange,
}) {
  return (
    <section className="settings-card">
      <div className="settings-card-heading">
        <h2>Appearance</h2>
        <p>Customize how Aura looks.</p>
      </div>

      <div className="settings-row">
        <div>
          <strong>Theme</strong>
          <span>Choose your preferred appearance.</span>
        </div>

        <select
          value={theme}
          onChange={(event) =>
            onThemeChange(event.target.value)
          }
        >
          <option value="system">
            System
          </option>

          <option value="dark">
            Dark
          </option>

          <option value="light">
            Light
          </option>
        </select>
      </div>
    </section>
  );
}

export default AppearanceSettings;
