import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPoll() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 20V10M12 20V4M20 20v-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNews() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="14" height="15" rx="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 9h6M7 13h6M7 17h3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDocs() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-4 4.2-6 7.5-6s6.1 2 7.5 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconOwner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3 4.5 6v6c0 4.5 3 7.5 7.5 9 4.5-1.5 7.5-4.5 7.5-9V6L12 3Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function BottomNav() {
  const { profile } = useAuth();
  if (!profile) return null;

  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => "bottom-nav-link" + (isActive ? " active" : "")}>
        <IconHome />
        <span>Start</span>
      </NavLink>
      <NavLink to="/abstimmungen" className={({ isActive }) => "bottom-nav-link" + (isActive ? " active" : "")}>
        <IconPoll />
        <span>Abstimmungen</span>
      </NavLink>
      <NavLink to="/news" className={({ isActive }) => "bottom-nav-link" + (isActive ? " active" : "")}>
        <IconNews />
        <span>Neuigkeiten</span>
      </NavLink>
      <NavLink to="/dokumente" className={({ isActive }) => "bottom-nav-link" + (isActive ? " active" : "")}>
        <IconDocs />
        <span>Dokumente</span>
      </NavLink>
      <NavLink to="/profil" className={({ isActive }) => "bottom-nav-link" + (isActive ? " active" : "")}>
        <IconProfile />
        <span>Profil</span>
      </NavLink>
      {profile.role === "owner" && (
        <NavLink to="/owner" className={({ isActive }) => "bottom-nav-link" + (isActive ? " active" : "")}>
          <IconOwner />
          <span>Owner</span>
        </NavLink>
      )}
    </nav>
  );
}
