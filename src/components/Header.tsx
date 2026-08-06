import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { LANGUAGE_LABELS, Language } from "../i18n/translations";

export default function Header() {
  const { profile, signOut } = useAuth();
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="header">
      <div className="header-top">
        <Link to="/" className="header-brand">
          <img src="/mvx-logo.png" alt="MVX" className="logo" />
          <span className="header-title">{t("common.appTitle")}</span>
        </Link>

        <div className="header-actions">
          <label className="lang-select">
            <span className="sr-only">{t("common.language")}</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              aria-label={t("common.language")}
            >
              {(Object.keys(LANGUAGE_LABELS) as Language[]).map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          </label>

          {profile && (
            <button className="btn-ghost btn-sm" onClick={() => signOut()}>
              {t("common.signOut")}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
