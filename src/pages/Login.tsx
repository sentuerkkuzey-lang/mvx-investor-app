import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("E-Mail oder Passwort ist falsch.");
    }
    setSubmitting(false);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/mvx-logo.png" alt="MVX" className="login-logo" />
        <h1 className="font-display">MVX Investor Portal</h1>
        <p className="muted small center">Melde dich mit den Zugangsdaten an, die du vom Owner erhalten hast.</p>

        <form onSubmit={handleLogin}>
          <input
            type="email"
            placeholder="E-Mail"
            value={email}
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Passwort"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Anmelden…" : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
