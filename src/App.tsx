import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import Dashboard from "./pages/Dashboard";
import OwnerPanel from "./pages/OwnerPanel";
import Polls from "./pages/Polls";
import Profile from "./pages/Profile";
import News from "./pages/News";
import Documents from "./pages/Documents";
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

      <Route
        path="/abstimmungen"
        element={
          <RequireAuth>
            <Polls />
          </RequireAuth>
        }
      />

      <Route
        path="/news"
        element={
          <RequireAuth>
            <News />
          </RequireAuth>
        }
      />

      <Route
        path="/dokumente"
        element={
          <RequireAuth>
            <Documents />
          </RequireAuth>
        }
      />

      <Route
        path="/profil"
        element={
          <RequireAuth>
            <Profile />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
