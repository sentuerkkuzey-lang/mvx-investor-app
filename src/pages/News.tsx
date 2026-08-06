import { FormEvent, useEffect, useState } from "react";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { NewsPost } from "../types/models";

export default function News() {
  const { profile } = useAuth();

  return (
    <div className="page">
      <Header />
      <h1 className="font-display">Neuigkeiten</h1>

      {profile?.role === "owner" && (
        <CreateNewsForm onCreated={() => window.dispatchEvent(new Event("mvx:news-created"))} />
      )}

      <NewsList />
    </div>
  );
}

function CreateNewsForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    const { error: rpcError } = await supabase.rpc("create_news_post", {
      p_title: title,
      p_content: content,
      p_pinned: pinned
    });

    if (rpcError) {
      setError(rpcError.message);
      setSubmitting(false);
      return;
    }

    setTitle("");
    setContent("");
    setPinned(false);
    setOpen(false);
    onCreated();
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button className="btn-secondary" style={{ marginBottom: 20 }} onClick={() => setOpen(true)}>
        + Neuen Beitrag veröffentlichen
      </button>
    );
  }

  return (
    <div className="card">
      <h2>Neuer Beitrag</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="Titel" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea
          placeholder="Inhalt"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          required
        />

        <label className="checkbox-row">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          <span>Oben anheften</span>
        </label>

        {error && <p className="error">{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Wird veröffentlicht…" : "Veröffentlichen"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

function NewsList() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("news_posts")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (loadError) setError(loadError.message);
    else setPosts((data ?? []) as NewsPost[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener("mvx:news-created", load);
    return () => window.removeEventListener("mvx:news-created", load);
  }, []);

  async function remove(id: string) {
    setError("");
    const { error: rpcError } = await supabase.rpc("delete_news_post", { p_id: id });
    if (rpcError) setError(rpcError.message);
    else await load();
  }

  if (loading) return <p className="muted">Lade…</p>;
  if (error) return <p className="error">{error}</p>;
  if (posts.length === 0) return <p className="muted">Noch keine Neuigkeiten vorhanden.</p>;

  return (
    <>
      {posts.map((post) => (
        <div key={post.id} className="card news-card">
          <div className="news-card-head">
            <h2>
              {post.pinned && <span className="badge badge-pinned">Angeheftet</span>} {post.title}
            </h2>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{post.content}</p>
          <p className="muted small" style={{ marginTop: 10 }}>
            {new Date(post.created_at).toLocaleString("de-DE")}
          </p>
          {profile?.role === "owner" && (
            <button className="btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => remove(post.id)}>
              Löschen
            </button>
          )}
        </div>
      ))}
    </>
  );
}
