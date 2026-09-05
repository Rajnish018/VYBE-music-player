export default function AuthLayout({ children }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark">A</span>
          <span>Aura</span>
        </div>

        {children}
      </section>
    </main>
  );
}
