import { FormEvent, useEffect, useState } from "react";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Poll, PollOption, PollOptionResult, PollUrgency } from "../types/models";

const URGENCY_LABELS: Record<PollUrgency, string> = {
  normal: "Normal",
  urgent: "Dringend",
  emergency: "Notfall"
};

export default function Polls() {
  const { profile } = useAuth();

  return (
    <div className="page">
      <Header />
      <h1 className="font-display">Abstimmungen</h1>

      {profile?.role === "owner" && (
        <CreatePollForm onCreated={() => window.dispatchEvent(new Event("mvx:poll-created"))} />
      )}

      <PollList />
    </div>
  );
}

function CreatePollForm({ onCreated }: { onCreated: () => void }) {
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [urgency, setUrgency] = useState<PollUrgency>("normal");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function addOption() {
    setOptions((prev) => [...prev, ""]);
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
  }

  function resetForm() {
    setQuestion("");
    setDescription("");
    setOptions(["", ""]);
    setClosesAt("");
    setUrgency("normal");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      setError("Bitte mindestens 2 Optionen angeben.");
      return;
    }

    setSubmitting(true);

    const { data: pollId, error: rpcError } = await supabase.rpc("create_poll", {
      p_question: question,
      p_description: description || null,
      p_options: cleanOptions,
      p_closes_at: closesAt ? new Date(closesAt).toISOString() : null,
      p_urgency: urgency
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    resetForm();
    setOpen(false);
    onCreated();

    // Push-Benachrichtigung an alle abonnierten Geräte auslösen. Ein
    // Fehler hier (z.B. VAPID-Keys noch nicht gesetzt) soll das
    // Erstellen der Abstimmung selbst nicht scheitern lassen.
    if (pollId) {
      supabase.functions.invoke("send-poll-notification", { body: { pollId } }).catch(() => {});
    }

    setSubmitting(false);
  }

  if (!open) {
    return (
      <button className="btn-secondary" style={{ marginBottom: 20 }} onClick={() => setOpen(true)}>
        + Neue Abstimmung erstellen
      </button>
    );
  }

  return (
    <div className="card">
      <h2>Neue Abstimmung</h2>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Frage"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          required
        />
        <input
          placeholder="Beschreibung (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {options.map((option, index) => (
          <div key={index} className="poll-option-input-row">
            <input
              placeholder={`Option ${index + 1}`}
              value={option}
              onChange={(e) => updateOption(index, e.target.value)}
            />
            {options.length > 2 && (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => removeOption(index)}
              >
                Entfernen
              </button>
            )}
          </div>
        ))}

        <button type="button" className="btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={addOption}>
          + Option hinzufügen
        </button>

        <label className="muted small" htmlFor="closes-at">
          Ende (optional)
        </label>
        <input
          id="closes-at"
          type="datetime-local"
          value={closesAt}
          onChange={(e) => setClosesAt(e.target.value)}
        />

        <label className="muted small" htmlFor="urgency">
          Dringlichkeit
        </label>
        <div className="urgency-select" id="urgency">
          {(Object.keys(URGENCY_LABELS) as PollUrgency[]).map((level) => (
            <button
              key={level}
              type="button"
              className={"urgency-option urgency-" + level + (urgency === level ? " selected" : "")}
              onClick={() => setUrgency(level)}
            >
              {URGENCY_LABELS[level]}
            </button>
          ))}
        </div>
        <p className="muted small" style={{ margin: "4px 0 12px" }}>
          {urgency === "normal" && "Normale Benachrichtigung, weißer Rand."}
          {urgency === "urgent" && "Hohe Relevanz, sonst normale Benachrichtigung, oranger Rand."}
          {urgency === "emergency" && "Dringende Benachrichtigung, roter Rand."}
        </p>

        {error && <p className="error">{error}</p>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Wird erstellt…" : "Abstimmung erstellen"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

function PollList() {
  const { profile } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [optionsByPoll, setOptionsByPoll] = useState<Record<string, PollOption[]>>({});
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, PollOptionResult[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    const { data: pollData, error: pollError } = await supabase
      .from("polls")
      .select("*")
      .order("created_at", { ascending: false });

    if (pollError) {
      setError(pollError.message);
      setLoading(false);
      return;
    }

    const pollList = (pollData ?? []) as Poll[];
    setPolls(pollList);

    if (pollList.length === 0) {
      setOptionsByPoll({});
      setMyVotes({});
      setResults({});
      setLoading(false);
      return;
    }

    const pollIds = pollList.map((p) => p.id);

    const [{ data: optionData }, { data: voteData }] = await Promise.all([
      supabase.from("poll_options").select("*").in("poll_id", pollIds).order("position", { ascending: true }),
      supabase.from("votes").select("poll_id, option_id")
    ]);

    const grouped: Record<string, PollOption[]> = {};
    ((optionData ?? []) as PollOption[]).forEach((o) => {
      grouped[o.poll_id] = [...(grouped[o.poll_id] ?? []), o];
    });
    setOptionsByPoll(grouped);

    const votes: Record<string, string> = {};
    ((voteData ?? []) as { poll_id: string; option_id: string }[]).forEach((v) => {
      votes[v.poll_id] = v.option_id;
    });
    setMyVotes(votes);

    const resultsEntries = await Promise.all(
      pollList
        .filter((p) => p.status === "closed" || votes[p.id])
        .map(async (p) => {
          const { data } = await supabase.rpc("poll_option_results", { p_poll_id: p.id });
          return [p.id, (data ?? []) as PollOptionResult[]] as const;
        })
    );
    setResults(Object.fromEntries(resultsEntries));

    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener("mvx:poll-created", load);
    return () => window.removeEventListener("mvx:poll-created", load);
  }, []);

  async function vote(pollId: string, optionId: string) {
    setError("");
    const { error: rpcError } = await supabase.rpc("cast_vote", {
      p_poll_id: pollId,
      p_option_id: optionId
    });

    if (rpcError) setError(rpcError.message);
    else await load();
  }

  async function close(pollId: string) {
    setError("");
    const { error: rpcError } = await supabase.rpc("close_poll", { p_poll_id: pollId });
    if (rpcError) setError(rpcError.message);
    else await load();
  }

  if (loading) return <p className="muted">Lade…</p>;
  if (error) return <p className="error">{error}</p>;
  if (polls.length === 0) return <p className="muted">Noch keine Abstimmungen vorhanden.</p>;

  return (
    <>
      {polls.map((poll) => {
        const pollOptions = optionsByPoll[poll.id] ?? [];
        const myVote = myVotes[poll.id];
        const pollResults = results[poll.id];
        const showResults = poll.status === "closed" || Boolean(myVote);
        const totalVotes = pollResults?.reduce((sum, r) => sum + r.vote_count, 0) ?? 0;

        return (
          <div key={poll.id} className={"card poll-card urgency-border-" + poll.urgency}>
            <div className="poll-card-head">
              <h2>{poll.question}</h2>
              <div className="poll-badges">
                {poll.urgency !== "normal" && (
                  <span className={"badge badge-" + poll.urgency}>{URGENCY_LABELS[poll.urgency]}</span>
                )}
                <span className={"badge " + (poll.status === "open" ? "badge-open" : "badge-closed")}>
                  {poll.status === "open" ? "Offen" : "Geschlossen"}
                </span>
              </div>
            </div>

            {poll.description && <p className="muted small">{poll.description}</p>}
            {poll.closes_at && (
              <p className="muted small">
                Ende: {new Date(poll.closes_at).toLocaleString("de-DE")}
              </p>
            )}

            {!showResults &&
              pollOptions.map((option) => (
                <button
                  key={option.id}
                  className="poll-option"
                  onClick={() => vote(poll.id, option.id)}
                >
                  {option.label}
                </button>
              ))}

            {showResults && pollResults && (
              <div className="poll-results">
                {pollResults.map((r) => {
                  const pct = totalVotes > 0 ? Math.round((r.vote_count / totalVotes) * 100) : 0;
                  const mine = r.option_id === myVote;
                  return (
                    <div key={r.option_id} className="poll-result-row">
                      <div className="poll-result-label">
                        <span>
                          {r.label} {mine && <span className="poll-mine">· deine Stimme</span>}
                        </span>
                        <span className="muted small">
                          {r.vote_count} ({pct}%)
                        </span>
                      </div>
                      <div className="poll-bar">
                        <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                <p className="muted small" style={{ marginTop: 8 }}>
                  {totalVotes} Stimme{totalVotes === 1 ? "" : "n"} insgesamt
                </p>
              </div>
            )}

            {profile?.role === "owner" && poll.status === "open" && (
              <button className="btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => close(poll.id)}>
                Abstimmung schließen
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
