import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { showAppToast } from "./appToast";
import type { Lang } from "./langMeta";
import {
  getCountryName,
  getLangEntry,
  getLanguageName,
  getLangsByRegion,
  LANG_REGION_ORDER,
  resolveAppI18n,
  type LangRegion,
} from "./langMeta";

type LangPickerProps = {
  variant?: "auth" | "default" | "header";
  className?: string;
  showToast?: boolean;
};

export const LangPicker = ({
  variant = "default",
  className = "",
  showToast = true,
}: LangPickerProps) => {
  const { lang, setLang, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const entry = getLangEntry(lang);
  const uiLocale = resolveAppI18n(lang);
  const uiKey = uiLocale === "id" ? "id" : "en";

  const regionLabel = (region: LangRegion) => {
    const map: Record<LangRegion, string> = {
      primary: t.settings.langRegionPrimary,
      asean: t.settings.langRegionAsean,
      south_asia: t.settings.langRegionSouthAsia,
      africa_west: t.settings.langRegionAfricaWest,
      africa_central: t.settings.langRegionAfricaCentral,
      africa: t.settings.langRegionAfrica,
      asia: t.settings.langRegionAsia,
      middle_east: t.settings.langRegionMiddleEast,
    };
    return map[region];
  };

  const pickLang = (code: Lang) => {
    if (lang === code) {
      setOpen(false);
      return;
    }
    setLang(code);
    if (showToast) {
      const nextEntry = getLangEntry(code);
      const nextUi = resolveAppI18n(code);
      showAppToast(
        t.lang.switched(getCountryName(nextEntry, nextUi === "id" ? "id" : "en")),
        "info",
      );
    }
    setOpen(false);
  };

  const onDocPointer = useCallback((e: MouseEvent | TouchEvent) => {
    if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("touchstart", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("touchstart", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onDocPointer]);

  const isAuth = variant === "auth";
  const isHeader = variant === "header";

  const btnClass = isAuth
    ? `gp-lang-toggle gp-lang-toggle--auth ${className}`.trim()
    : isHeader
      ? `gp-lang-toggle gp-lang-toggle--default gp-lang-toggle--in-header ${className}`.trim()
      : `gp-lang-toggle gp-lang-toggle--default ${className}`.trim();

  return (
    <div ref={wrapRef} className={`gp-lang-picker-wrap${open ? " gp-lang-picker-wrap--open" : ""}`}>
      <button
        type="button"
        aria-label={`${getCountryName(entry, uiKey)} (${entry.countryCode})`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={btnClass}
      >
        {!isAuth && !isHeader ? null : <span className="gp-lang-toggle__glow" aria-hidden />}
        <Globe className="gp-lang-toggle__icon" strokeWidth={1.75} aria-hidden />
        <span className="gp-lang-toggle__badge" aria-hidden>
          {entry.countryCode}
        </span>
        {!isAuth && (
          <ChevronDown
            className={`gp-lang-picker__chev${open ? " gp-lang-picker__chev--open" : ""}`}
            strokeWidth={2.25}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.settings.langLabel}
          className={`gp-lang-picker__menu gp-lang-picker__menu--anchored${isAuth ? " gp-lang-picker__menu--auth" : ""}`}
        >
          <p className="gp-lang-picker__menu-title">{t.settings.langLabel}</p>
          <div className="gp-lang-picker__scroll-wrap">
            <div className="gp-lang-picker__scroll">
              {LANG_REGION_ORDER.map((region) => {
                const entries = getLangsByRegion(region);
                if (!entries.length) return null;
                return (
                  <div key={region} className="gp-lang-picker__region-group">
                    <p className="gp-lang-picker__region-title">{regionLabel(region)}</p>
                    {entries.map((item) => {
                      const active = lang === item.code;
                      return (
                        <button
                          key={item.code}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => pickLang(item.code)}
                          className={`gp-lang-picker__option${active ? " gp-lang-picker__option--active" : ""}`}
                        >
                          <span className="gp-lang-picker__option-code">{item.countryCode}</span>
                          <span className="gp-lang-picker__option-text">
                            <span className="gp-lang-picker__option-label">
                              {getCountryName(item, uiKey)}
                            </span>
                            <span className="gp-lang-picker__option-sub">
                              {getLanguageName(item, uiKey)}
                            </span>
                          </span>
                          {active ? (
                            <Check className="gp-lang-picker__option-check" strokeWidth={2.5} />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
