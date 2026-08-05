import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function ForcePasswordChange() {
  const { session, profile, refreshProfile, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (!loading && !session) return <Navigate to="/login" replace />;
  if (!loading && profile && !profile.first_login) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSubmitting(true);

    const { error: updateAuthError } = await supabase.auth.updateUser({ password });
    if (updateAuthError) {
      setError(updateAuthError.message);
      setSubmitting(false);
      return;
    }

    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({ first_login: false })
      .eq("id", profile!.id);

    if (updateProfileError) {
      setError(updateProfileError.message);
      setSubmitting(false);
      return;
    }

    await refreshProfile();
    setSubmitting(false);
    navigate("/", { replace: true });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/mvx-logo.png" alt="MVX" className="login-logo" />
        <h1 className="font-display">Neues Passwort festlegen</h1>
        <p className="muted small center">
          Das ist deine erste Anmeldung. Bitte lege ein eigenes, sicheres Passwort fest.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Neues Passwort"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Passwort bestätigen"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
            required
          />

          {error && <p className="error">{error}</p>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Speichern…" : "Passwort speichern"}
          </button>
        </form>
      </div>
    </div>
  );
}
