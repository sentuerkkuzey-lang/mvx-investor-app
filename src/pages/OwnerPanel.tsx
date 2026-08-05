import { FormEvent, useEffect, useState } from "react";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { Profile } from "../types/models";

export default function OwnerPanel() {
  return (
    <div className="page">
      <Header />
      <h1 className="font-display">Owner Panel</h1>

      <CreateInvestor onCreated={() => window.dispatchEvent(new Event("mvx:investor-created"))} />
      <InvestorList />
    </div>
  );
}

function CreateInvestor({ onCreated }: { onCreated: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [shares, setShares] = useState(0);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createAccount(e: FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);
    setSubmitting(true);

    const { data, error: fnError } = await supabase.functions.invoke("create-investor", {
      body: { email, fullName, shares }
    });

    if (fnError) {
      setError(fnError.message);
    } else if (data?.error) {
      setError(data.error);
    } else {
      setResult({ email: data.email, tempPassword: data.tempPassword });
      setEmail("");
      setFullName("");
      setShares(0);
      onCreated();
    }
    setSubmitting(false);
  }

  return (
    <div className="card">
      <h2>Konto anlegen</h2>
      <form onSubmit={createAccount}>
        <input
          placeholder="Vollständiger Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="E-Mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="number"
          min={0}
          placeholder="Anteile"
          value={shares || ""}
          onChange={(e) => setShares(Number(e.target.value))}
        />

        {error && <p className="error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Wird angelegt…" : "Konto anlegen"}
        </button>
      </form>

      {result && (
        <div className="result-box">
          <h3>Konto erstellt</h3>
          <p>E-Mail: {result.email}</p>
          <p>
            Temporäres Passwort: <strong>{result.tempPassword}</strong>
          </p>
          <p className="muted small">
            Gib diese Daten sicher an die Person weiter. Beim ersten Login muss sie ein eigenes Passwort
            festlegen.
          </p>
        </div>
      )}
    </div>
  );
}

function InvestorList() {
  const [investors, setInvestors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "investor")
      .order("full_name", { ascending: true });

    if (loadError) setError(loadError.message);
    else setInvestors((data ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener("mvx:investor-created", load);
    return () => window.removeEventListener("mvx:investor-created", load);
  }, []);

  async function addShares(userId: string) {
    const amount = amounts[userId] || 0;
    if (!amount) return;

    setBusyId(userId);
    setError("");

    const { error: rpcError } = await supabase.rpc("owner_add_shares", {
      p_user_id: userId,
      p_amount: amount
    });

    if (rpcError) setError(rpcError.message);
    else {
      setAmounts((prev) => ({ ...prev, [userId]: 0 }));
      await load();
    }
    setBusyId(null);
  }

  return (
    <div className="card">
      <h2>Investoren &amp; Anteile</h2>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Lade…</p>}
      {!loading && investors.length === 0 && <p className="muted">Noch keine Investoren angelegt.</p>}

      {investors.map((inv) => (
        <div key={inv.id} className="investor-row">
          <div>
            <p className="investor-name">{inv.full_name}</p>
            <p className="muted small">{inv.email}</p>
          </div>

          <div className="investor-shares">
            <span className="shares-badge">{inv.shares} Anteile</span>
            <input
              type="number"
              placeholder="+ Anzahl"
              className="shares-input"
              value={amounts[inv.id] || ""}
              onChange={(e) =>
                setAmounts((prev) => ({ ...prev, [inv.id]: Number(e.target.value) }))
              }
            />
            <button
              className="btn-primary btn-sm"
              disabled={busyId === inv.id || !amounts[inv.id]}
              onClick={() => addShares(inv.id)}
            >
              Hinzufügen
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
