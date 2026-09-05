import './Loading.css';

function Loading({
  text = 'Loading...',
  fullScreen = false,
}) {
  return (
    <div
      className={`loading ${fullScreen ? 'loading-fullscreen' : 'loading-inline'}`}
      role="status"
      aria-live="polite"
      aria-label={text}
    >
      <div className="loading-bars">
        <span className="loading-bar loading-bar-1" />
        <span className="loading-bar loading-bar-2" />
        <span className="loading-bar loading-bar-3" />
        <span className="loading-bar loading-bar-4" />
        <span className="loading-bar loading-bar-5" />
      </div>

      {text && (
        <p className="loading-text">
          {text}
        </p>
      )}
    </div>
  );
}

export default Loading;