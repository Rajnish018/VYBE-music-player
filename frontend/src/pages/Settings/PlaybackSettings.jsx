function PlaybackSettings({
  volume,
  onVolumeChange,
}) {
  return (
    <section className="settings-card">
      <div className="settings-card-heading">
        <h2>Playback</h2>
        <p>Configure your music playback.</p>
      </div>

      <div className="settings-row">
        <div>
          <strong>Default volume</strong>
          <span>Set the player volume.</span>
        </div>

        <div className="settings-range">
          <input
            aria-label="Default volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) =>
              onVolumeChange(
                Number(event.target.value),
              )
            }
          />

          <span>
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </section>
  );
}

export default PlaybackSettings;
