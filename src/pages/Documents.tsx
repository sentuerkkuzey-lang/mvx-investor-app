import { FormEvent, useEffect, useState } from "react";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { DocumentFile } from "../types/models";

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Documents() {
  const { profile } = useAuth();

  return (
    <div className="page">
      <Header />
      <h1 className="font-display">Dokumente</h1>

      {profile?.role === "owner" && (
        <UploadDocumentForm onUploaded={() => window.dispatchEvent(new Event("mvx:document-uploaded"))} />
      )}

      <DocumentList />
    </div>
  );
}

function UploadDocumentForm({ onUploaded }: { onUploaded: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!file) {
      setError("Bitte eine Datei auswählen.");
      return;
    }

    setSubmitting(true);

    const storagePath = `${crypto.randomUUID()}-${file.name}`;

    const { error: uploadError } = await supabase.storage.from("documents").upload(storagePath, file);

    if (uploadError) {
      setError(
        uploadError.message.includes("Bucket not found")
          ? "Der Storage-Bucket 'documents' wurde noch nicht angelegt (siehe README)."
          : uploadError.message
      );
      setSubmitting(false);
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("documents")
      .insert({
        title,
        description: description || null,
        storage_path: storagePath,
        file_name: file.name,
        file_size: file.size,
        uploaded_by: (await supabase.auth.getUser()).data.user?.id
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setSubmitting(false);
      return;
    }

    if (inserted) {
      await supabase.rpc("log_document_upload", { p_title: title, p_id: inserted.id });
    }

    setTitle("");
    setDescription("");
    setFile(null);
    setOpen(false);
    onUploaded();
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button className="btn-secondary" style={{ marginBottom: 20 }} onClick={() => setOpen(true)}>
        + Dokument hochladen
      </button>
    );
  }

  return (
    <div className="card">
      <h2>Dokument hochladen</h2>
      <form onSubmit={handleSubmit}>
        <input placeholder="Titel" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input
          placeholder="Beschreibung (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />

        {error && <p className="error">{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Wird hochgeladen…" : "Hochladen"}
          </button>
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}

function DocumentList() {
  const { profile } = useAuth();
  const [docs, setDocs] = useState<DocumentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });

    if (loadError) setError(loadError.message);
    else setDocs((data ?? []) as DocumentFile[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    window.addEventListener("mvx:document-uploaded", load);
    return () => window.removeEventListener("mvx:document-uploaded", load);
  }, []);

  async function download(doc: DocumentFile) {
    setBusyId(doc.id);
    setError("");
    const { data, error: urlError } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.storage_path, 60);

    if (urlError || !data) {
      setError(urlError?.message ?? "Download nicht möglich.");
    } else {
      window.open(data.signedUrl, "_blank");
    }
    setBusyId(null);
  }

  async function remove(doc: DocumentFile) {
    setBusyId(doc.id);
    setError("");

    await supabase.storage.from("documents").remove([doc.storage_path]);
    const { error: deleteError } = await supabase.from("documents").delete().eq("id", doc.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      await supabase.rpc("log_document_delete", { p_title: doc.title, p_id: doc.id });
      await load();
    }
    setBusyId(null);
  }

  if (loading) return <p className="muted">Lade…</p>;
  if (error) return <p className="error">{error}</p>;
  if (docs.length === 0) return <p className="muted">Noch keine Dokumente vorhanden.</p>;

  return (
    <div className="card">
      {docs.map((doc) => (
        <div key={doc.id} className="document-row">
          <div>
            <p className="investor-name">{doc.title}</p>
            {doc.description && <p className="muted small">{doc.description}</p>}
            <p className="muted small">
              {doc.file_name} {doc.file_size ? `· ${formatSize(doc.file_size)}` : ""} ·{" "}
              {new Date(doc.created_at).toLocaleDateString("de-DE")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost btn-sm" disabled={busyId === doc.id} onClick={() => download(doc)}>
              Herunterladen
            </button>
            {profile?.role === "owner" && (
              <button className="btn-ghost btn-sm" disabled={busyId === doc.id} onClick={() => remove(doc)}>
                Löschen
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
