import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Language, translations } from "./translations";

const STORAGE_KEY = "mvx-language";

function detectInitialLanguage(): Language {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "de" || stored === "en") return stored;

  const browserLang = navigator.language?.toLowerCase() ?? "";
  return browserLang.startsWith("de") ? "de" : "en";
}

type LanguageContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => detectInitialLanguage());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(lang: Language) {
    setLanguageState(lang);
  }

  function t(key: string, vars?: Record<string, string | number>) {
    const dict = translations[language] as Record<string, string>;
    let text = dict[key] ?? key;
    if (vars) {
      for (const [varKey, value] of Object.entries(vars)) {
        text = text.replace(`{${varKey}}`, String(value));
      }
    }
    return text;
  }

  const value = useMemo(() => ({ language, setLanguage, t }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
