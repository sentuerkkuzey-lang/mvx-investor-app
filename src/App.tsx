import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import Dashboard from "./pages/Dashboard";
import OwnerPanel from "./pages/OwnerPanel";
import { RequireAuth, RequireOwner } from "./components/RouteGuards";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/passwort-aendern" element={<ForcePasswordChange />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <Dashboard />
          </RequireAuth>
        }
      />

      <Route
        path="/owner"
        element={
          <RequireAuth>
            <RequireOwner>
              <OwnerPanel />
            </RequireOwner>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
