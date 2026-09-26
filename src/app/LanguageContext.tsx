import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Lang } from "./langMeta";
import { normalizeLang, isRtlLang, resolveAppI18n } from "./langMeta";
import { resolveI18nBundle } from "./i18n/resolveBundle";
import type { I18nBundle } from "./i18n/types";

const STORAGE_KEY = "garuda_prime_lang";

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: I18nBundle;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
};

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "id";
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalizeLang(stored);
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = resolveAppI18n(lang);
    document.documentElement.dir = isRtlLang(lang) ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === "id" ? "gb" : "id"));
  }, []);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang,
      t: resolveI18nBundle(lang),
    }),
    [lang, setLang, toggleLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export { getLangEntry } from "./langMeta";
