import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import Header from "../components/Header";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { Poll, NewsPost } from "../types/models";

const URGENCY_PRIORITY: Record<string, number> = { emergency: 0, urgent: 1, normal: 2 };

export default function Dashboard() {
  const { profile } = useAuth();
  const [urgentPolls, setUrgentPolls] = useState<Poll[]>([]);
  const [latestNews, setLatestNews] = useState<NewsPost[]>([]);

  useEffect(() => {
    supabase
      .from("polls")
      .select("*")
      .eq("status", "open")
      .in("urgency", ["urgent", "emergency"])
      .then(({ data }) => {
        const polls = (data ?? []) as Poll[];
        polls.sort((a, b) => URGENCY_PRIORITY[a.urgency] - URGENCY_PRIORITY[b.urgency]);
        setUrgentPolls(polls);
      });

    supabase
      .from("news_posts")
      .select("*")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2)
      .then(({ data }) => setLatestNews((data ?? []) as NewsPost[]));
  }, []);

  if (profile?.role === "owner") return <Navigate to="/owner" replace />;

  return (
    <div className="page">
      <Header />

      <h1 className="font-display">Willkommen, {profile?.full_name}</h1>

      {urgentPolls.map((poll) => (
        <Link
          key={poll.id}
          to="/abstimmungen"
          className={"card urgency-alert urgency-border-" + poll.urgency}
        >
          <span className={"badge badge-" + poll.urgency}>
            {poll.urgency === "emergency" ? "Notfall" : "Dringend"}
          </span>
          <p style={{ margin: "10px 0 0", fontWeight: 600 }}>{poll.question}</p>
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            Zur Abstimmung →
          </p>
        </Link>
      ))}

      <div className="card center">
        <p className="muted small">Deine Anteile</p>
        <p className="shares-number">{profile?.shares ?? 0}</p>
      </div>

      {latestNews.length > 0 && (
        <div className="card">
          <h2>Neuigkeiten</h2>
          {latestNews.map((post) => (
            <div key={post.id} style={{ marginBottom: 12 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>{post.title}</p>
              <p className="muted small" style={{ margin: "2px 0 0" }}>
                {new Date(post.created_at).toLocaleDateString("de-DE")}
              </p>
            </div>
          ))}
          <Link to="/news" className="muted small">
            Alle Neuigkeiten →
          </Link>
        </div>
      )}
    </div>
  );
}
