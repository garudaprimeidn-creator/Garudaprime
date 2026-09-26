import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemePreference = "light" | "dark" | "auto";
export type ThemeMode = ThemePreference;
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "garuda_prime_theme";
const THEME_MIGRATION_KEY = "gp_theme_dark_default_v2";
const THEME_USER_LIGHT_KEY = "gp_theme_user_light_opt_in";

export function resolveThemePreference(pref: ThemePreference): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  if (pref === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return pref;
}

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  if (!localStorage.getItem(THEME_MIGRATION_KEY)) {
    localStorage.setItem(THEME_MIGRATION_KEY, "1");
    localStorage.removeItem("gp_theme_dark_default_v1");
    localStorage.setItem(STORAGE_KEY, "dark");
    localStorage.removeItem(THEME_USER_LIGHT_KEY);
    return "dark";
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" && !localStorage.getItem(THEME_USER_LIGHT_KEY)) {
    localStorage.setItem(STORAGE_KEY, "dark");
    return "dark";
  }
  if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  return "dark";
}

function applyResolvedTheme(preference: ThemePreference, resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.setAttribute("data-theme", resolved);
  if (preference === "auto") root.setAttribute("data-theme-pref", "auto");
  else root.removeAttribute("data-theme-pref");
  root.style.colorScheme = resolved;
  localStorage.setItem(STORAGE_KEY, preference);
  if (preference === "light") {
    localStorage.setItem(THEME_USER_LIGHT_KEY, "1");
  } else {
    localStorage.removeItem(THEME_USER_LIGHT_KEY);
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#04090f" : "#f4f8f6");
}

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredPreference());
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveThemePreference(readStoredPreference()),
  );

  useEffect(() => {
    const resolved = resolveThemePreference(theme);
    setResolvedTheme(resolved);
    applyResolvedTheme(theme, resolved);
  }, [theme]);

  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = resolveThemePreference("auto");
      setResolvedTheme(resolved);
      applyResolvedTheme("auto", resolved);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((mode: ThemePreference) => setThemeState(mode), []);
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      isDark: resolvedTheme === "dark",
      toggleTheme,
      setTheme,
    }),
    [theme, resolvedTheme, toggleTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
