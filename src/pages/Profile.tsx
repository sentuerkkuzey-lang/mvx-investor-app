import { FormEvent, useEffect, useState } from "react";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { subscribeToPush, isPushSubscribed } from "../lib/push";
import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { profile } = useAuth();

  return (
    <div className="page">
      <Header />
      <h1 className="font-display">Profil</h1>

      <div className="card">
        <h2>Deine Daten</h2>
        <p className="muted small">Name</p>
        <p>{profile?.full_name}</p>
        <p className="muted small" style={{ marginTop: 12 }}>
          E-Mail
        </p>
        <p>{profile?.email}</p>
        <p className="muted small" style={{ marginTop: 12 }}>
          Rolle
        </p>
        <p>{profile?.role === "owner" ? "Owner" : "Investor"}</p>
        {profile?.role === "investor" && (
          <>
            <p className="muted small" style={{ marginTop: 12 }}>
              Anteile
            </p>
            <p>{profile?.shares}</p>
          </>
        )}
      </div>

      <PushSettings />
      <ChangePasswordForm />
    </div>
  );
}

function PushSettings() {
  const { profile } = useAuth();
  const [subscribed, setSubscribed] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    isPushSubscribed().then(setSubscribed);
  }, []);

  async function enable() {
    if (!profile) return;
    setError("");
    setSubmitting(true);
    const result = await subscribeToPush(profile.id);
    if (!result.ok) setError(result.error ?? "Unbekannter Fehler.");
    else setSubscribed(true);
    setSubmitting(false);
  }

  return (
    <div className="card">
      <h2>Push-Benachrichtigungen</h2>
      <p className="muted small">
        Erhalte eine Benachrichtigung auf diesem Gerät, sobald eine neue Abstimmung erstellt wird. Auf dem
        iPhone funktioniert das nur, wenn die App über „Zum Home-Bildschirm hinzufügen“ installiert wurde.
      </p>

      {subscribed ? (
        <p className="success">Benachrichtigungen sind auf diesem Gerät aktiviert.</p>
      ) : (
        <button className="btn-secondary" disabled={submitting} onClick={enable}>
          {submitting ? "Wird aktiviert…" : "Push-Benachrichtigungen aktivieren"}
        </button>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}

function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess(true);
      setPassword("");
      setConfirm("");
    }
    setSubmitting(false);
  }

  return (
    <div className="card">
      <h2>Passwort ändern</h2>
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
        {success && <p className="success">Passwort wurde geändert.</p>}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Speichern…" : "Passwort speichern"}
        </button>
      </form>
    </div>
  );
}
