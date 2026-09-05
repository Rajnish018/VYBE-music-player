import AuthLayout from './AuthLayout';

function SignupPage({
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

      <h1>Create your library</h1>

      <p className="auth-copy">
        Create an account to access your music library.
      </p>

      <form
        className="auth-form"
        onSubmit={onSubmit}
      >
        <label htmlFor="signup-email">
          Email
        </label>

        <input
          id="signup-email"
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

        <label htmlFor="signup-password">
          Password
        </label>

        <input
          id="signup-password"
          type="password"
          required
          minLength="6"
          autoComplete="new-password"
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
            ? 'Creating account...'
            : 'Create account'}
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
        Already registered? Sign in
      </button>
    </AuthLayout>
  );
}

export default SignupPage;
