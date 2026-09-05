import AuthLayout from './AuthLayout';

function LoginPage({
  form,
  loading,
  error,
  onChange,
  onSubmit,
  onSwitch,
}) {
  return (
    <AuthLayout>
      <p className="eyebrow">
        Private music library
      </p>

      <h1>Welcome back</h1>

      <p className="auth-copy">
        Sign in to listen to your MEGA-backed tracks.
      </p>

      <form
        className="auth-form"
        onSubmit={onSubmit}
      >
        <label htmlFor="login-email">
          Email
        </label>

        <input
          id="login-email"
          type="email"
          required
          autoComplete="email"
          value={form.email}
          onChange={(event) =>
            onChange({
              ...form,
              email: event.target.value,
            })
          }
        />

        <label htmlFor="login-password">
          Password
        </label>

        <input
          id="login-password"
          type="password"
          required
          minLength="6"
          autoComplete="current-password"
          value={form.password}
          onChange={(event) =>
            onChange({
              ...form,
              password: event.target.value,
            })
          }
        />

        <button
          type="submit"
          disabled={loading}
        >
          {loading
            ? 'Connecting...'
            : 'Sign in'}
        </button>

        {error ? (
          <small className="auth-error">
            {error}
          </small>
        ) : null}
      </form>

      <button
        className="auth-switch"
        type="button"
        onClick={onSwitch}
      >
        Need an account? Register
      </button>
    </AuthLayout>
  );
}

export default LoginPage;
