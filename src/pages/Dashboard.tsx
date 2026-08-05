import { Navigate } from "react-router-dom";
import Header from "../components/Header";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { profile } = useAuth();

  if (profile?.role === "owner") return <Navigate to="/owner" replace />;

  return (
    <div className="page">
      <Header />

      <h1 className="font-display">Willkommen, {profile?.full_name}</h1>

      <div className="card center">
        <p className="muted small">Deine Anteile</p>
        <p className="shares-number">{profile?.shares ?? 0}</p>
      </div>
    </div>
  );
}
