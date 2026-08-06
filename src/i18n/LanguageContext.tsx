import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";

export default function Header() {
  const { profile, signOut } = useAuth();
  const { t, language, setLanguage } = useLanguage();

  return (
    <header className="header">
      <div className="header-top">
        <Link to="/" className="header-brand">
          <img src="/mvx-logo.png" alt="MVX" className="logo" />
          <span className="header-title">
            {t("common.appTitle")}
          </span>
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <select
            value={language}
            onChange={(e) =>
              setLanguage(e.target.value as "de" | "en")
            }
            className="btn-ghost btn-sm"
            style={{
              background: "transparent",
              color: "white",
              border: "1px solid #444",
              borderRadius: "8px",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            <option value="de">🇩🇪 Deutsch</option>
            <option value="en">🇬🇧 English</option>
          </select>

          {profile && (
            <button
              className="btn-ghost btn-sm"
              onClick={() => signOut()}
            >
              {t("common.signOut")}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}