import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Header() {
  const { profile, signOut } = useAuth();

  return (
    <header className="header">
      <Link to="/" className="header-brand">
        <img src="/mvx-logo.png" alt="MVX" className="logo" />
        <span className="header-title">MVX Investor Portal</span>
      </Link>

      <div className="header-actions">
        {profile?.role === "owner" && (
          <Link to="/owner" className="btn-ghost btn-sm">
            Owner Panel
          </Link>
        )}
        {profile && (
          <button className="btn-ghost btn-sm" onClick={() => signOut()}>
            Abmelden
          </button>
        )}
      </div>
    </header>
  );
}
