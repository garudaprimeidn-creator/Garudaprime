import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Contrast, Globe, Moon, Sun } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { useTheme, type ThemePreference } from "./ThemeContext";
import { showAppToast } from "./appToast";
import type { Lang } from "./langMeta";
import {
  getCountryName,
  getLangEntry,
  getLanguageName,
  LANG_REGION_ORDER,
  resolveAppI18n,
  getLangsByRegion,
  type LangRegion,
} from "./langMeta";

export const AppearanceSettings = ({ compact = false }: { compact?: boolean }) => {
  const { theme, setTheme } = useTheme();
  const { lang, setLang, t } = useLanguage();
  const [langOpen, setLangOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const langBtnRef = useRef<HTMLButtonElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const syncMenuPos = useCallback(() => {
    const rect = langBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = Math.min(248, window.innerWidth - 32);
    const half = menuWidth / 2;
    const left = Math.max(
      16 + half,
      Math.min(window.innerWidth - 16 - half, rect.left + rect.width / 2),
    );
    setMenuPos({ top: rect.bottom + 8, left });
  }, []);

  const currentLang = getLangEntry(lang);
  const uiLocale = resolveAppI18n(lang);
  const currentCountryName = getCountryName(currentLang, uiLocale);

  const pickTheme = (mode: ThemePreference) => {
    if (theme === mode) return;
    setTheme(mode);
    if (mode === "light") showAppToast(t.theme.lightOn, "info");
    else if (mode === "dark") showAppToast(t.theme.darkOn, "info");
    else showAppToast(t.theme.autoOn, "info");
  };

  const pickLang = (code: Lang) => {
    const entry = getLangEntry(code);
    if (lang === code) {
      setLangOpen(false);
      return;
    }
    setLang(code);
    const nextUi = resolveAppI18n(code);
    showAppToast(t.lang.switched(getCountryName(entry, nextUi === "id" ? "id" : "en")), "info");
    setLangOpen(false);
  };

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

  const openLangMenu = useCallback(() => {
    syncMenuPos();
    setLangOpen(true);
  }, [syncMenuPos]);

  useEffect(() => {
    if (!langOpen) return;
    syncMenuPos();
    const onReflow = () => syncMenuPos();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [langOpen, syncMenuPos]);

  useEffect(() => {
    if (!langOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (barRef.current?.contains(target) || langMenuRef.current?.contains(target)) return;
      setLangOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLangOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [langOpen]);

  const btnSize = compact ? "w-7 h-7 rounded-lg" : "w-8 h-8 rounded-lg";
  const iconSize = compact ? "w-[14px] h-[14px]" : "w-[16px] h-[16px]";
  const moonSize = compact ? "w-[13px] h-[13px]" : "w-[15px] h-[15px]";
  const autoSize = compact ? "w-[13px] h-[13px]" : "w-[15px] h-[15px]";

  const themeActive = "gp-appearance-bar__btn--active";
  const themeIdle = "gp-appearance-bar__btn";

  return (
    <>
      <div
        ref={barRef}
        className={`gp-appearance-bar${compact ? " gp-appearance-bar--compact" : ""}`}
      >
        <div className="gp-appearance-bar__theme" role="group" aria-label={t.settings.themeLabel}>
          <button
            type="button"
            aria-label={t.theme.light}
            aria-pressed={theme === "light"}
            onClick={() => pickTheme("light")}
            className={`${themeIdle} ${btnSize} ${theme === "light" ? themeActive : ""}`}
          >
            <Sun className={iconSize} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={t.theme.auto}
            aria-pressed={theme === "auto"}
            onClick={() => pickTheme("auto")}
            className={`${themeIdle} ${btnSize} ${theme === "auto" ? themeActive : ""}`}
          >
            <Contrast className={autoSize} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={t.theme.dark}
            aria-pressed={theme === "dark"}
            onClick={() => pickTheme("dark")}
            className={`${themeIdle} ${btnSize} ${theme === "dark" ? themeActive : ""}`}
          >
            <Moon className={moonSize} strokeWidth={2} />
          </button>
        </div>

        <span className="gp-appearance-bar__divider" aria-hidden />

        <button
          ref={langBtnRef}
          type="button"
          aria-label={`${currentCountryName} (${currentLang.countryCode})`}
          aria-expanded={langOpen}
          aria-haspopup="listbox"
          onClick={() => (langOpen ? setLangOpen(false) : openLangMenu())}
          className={`gp-appearance-bar__lang${langOpen ? " gp-appearance-bar__lang--open" : ""}`}
        >
          <Globe className="gp-appearance-bar__lang-icon" strokeWidth={1.85} />
          <span className="gp-appearance-bar__lang-abbr">{currentLang.countryCode}</span>
          <ChevronDown className={`gp-appearance-bar__lang-chev${langOpen ? " gp-appearance-bar__lang-chev--open" : ""}`} strokeWidth={2.25} />
        </button>
      </div>

      {langOpen && menuPos && (
        <div
          ref={langMenuRef}
          role="listbox"
          aria-label={t.settings.langLabel}
          className="gp-lang-picker__menu"
          style={{ top: menuPos.top, left: menuPos.left }}
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
                  {entries.map((entry) => {
                    const active = lang === entry.code;
                    const label = getCountryName(entry, uiLocale === "id" ? "id" : "en");
                    const sub = getLanguageName(entry, uiLocale === "id" ? "id" : "en");
                    return (
                      <button
                        key={entry.code}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => pickLang(entry.code)}
                        className={`gp-lang-picker__option${active ? " gp-lang-picker__option--active" : ""}`}
                      >
                        <span className="gp-lang-picker__option-code">{entry.countryCode}</span>
                        <span className="gp-lang-picker__option-text">
                          <span className="gp-lang-picker__option-label">{label}</span>
                          <span className="gp-lang-picker__option-sub">{sub}</span>
                        </span>
                        {active ? <Check className="gp-lang-picker__option-check" strokeWidth={2.5} /> : null}
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
    </>
  );
};
