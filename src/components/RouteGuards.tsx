import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <FullscreenLoader />;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.first_login) return <Navigate to="/passwort-aendern" replace />;

  return <>{children}</>;
}

export function RequireOwner({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth();

  if (loading) return <FullscreenLoader />;
  if (profile?.role !== "owner") return <Navigate to="/" replace />;

  return <>{children}</>;
}

export function FullscreenLoader() {
  return (
    <div className="fullscreen-loader">
      <div className="spinner" />
    </div>
  );
}
