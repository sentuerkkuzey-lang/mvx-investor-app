import { FormEvent, useEffect, useMemo, useState } from "react";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { Profile, ActivityLogEntry } from "../types/models";

export default function OwnerPanel() {
  return (
    <div className="page">
      <Header />
      <h1 className="font-display">Owner Panel</h1>

      <StatsOverview />
      <CreateInvestor onCreated={() => window.dispatchEvent(new Event("mvx:investor-created"))} />
      <InvestorList />
      <ActivityLog />
    </div>
  );
}

function StatsOverview() {
  const [investors, setInvestors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").eq("role", "investor");
    setInvestors((data ?? []) as Profile[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener("mvx:investor-created", load);
    window.addEventListener("mvx:activity-logged", load);
    return () => {
      window.removeEventListener("mvx:investor-created", load);
      window.removeEventListener("mvx:activity-logged", load);
    };
  }, []);

  const totalShares = investors.reduce((sum, i) => sum + i.shares, 0);
  const sorted = [...investors].sort((a, b) => b.shares - a.shares);
  const top = sorted.slice(0, 6);

  if (loading) return <p className="muted">Lade Statistiken…</p>;

  return (
    <div className="card">
      <h2>Übersicht</h2>
      <div className="stats-grid">
        <div className="stat-box">
          <p className="muted small">Investoren</p>
          <p className="stat-number">{investors.length}</p>
        </div>
        <div className="stat-box">
          <p className="muted small">Anteile gesamt</p>
          <p className="stat-number">{totalShares}</p>
        </div>
        <div className="stat-box">
          <p className="muted small">Ø Anteile</p>
          <p className="stat-number">{investors.length ? Math.round(totalShares / investors.length) : 0}</p>
        </div>
      </div>

      {top.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Verteilung (Top {top.length})
          </p>
          {top.map((inv) => {
            const pct = totalShares > 0 ? Math.round((inv.shares / totalShares) * 100) : 0;
            return (
              <div key={inv.id} className="dist-row">
                <div className="dist-label">
                  <span>{inv.full_name}</span>
                  <span className="muted small">
                    {inv.shares} ({pct}%)
                  </span>
                </div>
                <div className="poll-bar">
                  <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
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
      window.dispatchEvent(new Event("mvx:activity-logged"));
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
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkAmount, setBulkAmount] = useState(0);
  const [bulkBusy, setBulkBusy] = useState(false);

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
      window.dispatchEvent(new Event("mvx:activity-logged"));
    }
    setBusyId(null);
  }

  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  function toggleSelected(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleAll() {
    if (selectedIds.length === investors.length) {
      setSelected({});
    } else {
      setSelected(Object.fromEntries(investors.map((i) => [i.id, true])));
    }
  }

  async function applyBulk() {
    if (!bulkAmount || selectedIds.length === 0) return;
    setBulkBusy(true);
    setError("");

    const { error: rpcError } = await supabase.rpc("owner_bulk_add_shares", {
      p_user_ids: selectedIds,
      p_amount: bulkAmount
    });

    if (rpcError) setError(rpcError.message);
    else {
      setBulkAmount(0);
      setSelected({});
      await load();
      window.dispatchEvent(new Event("mvx:activity-logged"));
    }
    setBulkBusy(false);
  }

  return (
    <div className="card">
      <h2>Investoren &amp; Anteile</h2>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Lade…</p>}
      {!loading && investors.length === 0 && <p className="muted">Noch keine Investoren angelegt.</p>}

      {investors.length > 0 && (
        <>
          <label className="checkbox-row" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={selectedIds.length === investors.length}
              onChange={toggleAll}
            />
            <span>Alle auswählen</span>
          </label>

          {selectedIds.length > 0 && (
            <div className="bulk-bar">
              <span className="muted small">{selectedIds.length} ausgewählt</span>
              <input
                type="number"
                placeholder="+/- Anzahl"
                className="shares-input"
                value={bulkAmount || ""}
                onChange={(e) => setBulkAmount(Number(e.target.value))}
              />
              <button className="btn-primary btn-sm" disabled={bulkBusy || !bulkAmount} onClick={applyBulk}>
                {bulkBusy ? "Wird angewendet…" : "Auf Auswahl anwenden"}
              </button>
            </div>
          )}
        </>
      )}

      {investors.map((inv) => (
        <div key={inv.id} className="investor-row">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={Boolean(selected[inv.id])}
              onChange={() => toggleSelected(inv.id)}
            />
            <div>
              <p className="investor-name">{inv.full_name}</p>
              <p className="muted small">{inv.email}</p>
            </div>
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

const ACTION_LABELS: Record<string, string> = {
  investor_created: "Konto angelegt",
  shares_added: "Anteile hinzugefügt",
  shares_removed: "Anteile entfernt",
  shares_bulk_added: "Anteile (Bulk) geändert",
  poll_created: "Abstimmung erstellt",
  poll_closed: "Abstimmung geschlossen",
  news_posted: "Neuigkeit veröffentlicht",
  news_deleted: "Neuigkeit gelöscht",
  document_uploaded: "Dokument hochgeladen",
  document_deleted: "Dokument gelöscht"
};

function ActivityLog() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (loadError) setError(loadError.message);
    else setEntries((data ?? []) as ActivityLogEntry[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("mvx:investor-created", handler);
    window.addEventListener("mvx:activity-logged", handler);
    window.addEventListener("mvx:poll-created", handler);
    window.addEventListener("mvx:news-created", handler);
    window.addEventListener("mvx:document-uploaded", handler);
    return () => {
      window.removeEventListener("mvx:investor-created", handler);
      window.removeEventListener("mvx:activity-logged", handler);
      window.removeEventListener("mvx:poll-created", handler);
      window.removeEventListener("mvx:news-created", handler);
      window.removeEventListener("mvx:document-uploaded", handler);
    };
  }, []);

  return (
    <div className="card">
      <h2>Aktivitätsprotokoll</h2>
      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Lade…</p>}
      {!loading && entries.length === 0 && <p className="muted">Noch keine Aktivität.</p>}

      {entries.map((entry) => (
        <div key={entry.id} className="activity-row">
          <div>
            <p style={{ margin: 0 }}>
              <strong>{entry.actor_name ?? "Owner"}</strong>{" "}
              <span className="muted small">{ACTION_LABELS[entry.action] ?? entry.action}</span>
            </p>
            {entry.target_label && <p className="muted small" style={{ margin: "2px 0 0" }}>{entry.target_label}</p>}
          </div>
          <p className="muted small" style={{ whiteSpace: "nowrap" }}>
            {new Date(entry.created_at).toLocaleString("de-DE")}
          </p>
        </div>
      ))}
    </div>
  );
}
