import { APP_I18N } from "../i18n";
import type { LangLocale } from "./types";
import type { I18nBundle } from "./types";
import { deepMerge } from "./merge";
import { LOCALE_OVERLAYS } from "./localeOverlays";
import { AUTH_LOCALE_OVERLAYS } from "./authOverlays";
import { resolveAppI18n, type Lang } from "../langMeta";

const bundleCache = new Map<LangLocale, I18nBundle>();

function mergeLocaleOverlay(locale: LangLocale): Partial<I18nBundle> | undefined {
  const base = LOCALE_OVERLAYS[locale];
  const auth = AUTH_LOCALE_OVERLAYS[locale];
  if (base && auth) return deepMerge(base as I18nBundle, auth as Partial<I18nBundle>);
  return (auth ?? base) as Partial<I18nBundle> | undefined;
}

export function resolveI18nBundle(lang: Lang): I18nBundle {
  const locale = resolveAppI18n(lang);
  if (locale === "id") return APP_I18N.id;
  if (locale === "en") return APP_I18N.en;

  const cached = bundleCache.get(locale);
  if (cached) return cached;

  const overlay = mergeLocaleOverlay(locale);
  const merged = overlay
    ? deepMerge(APP_I18N.en as I18nBundle, overlay as Partial<I18nBundle>)
    : APP_I18N.en;
  bundleCache.set(locale, merged);
  return merged;
}
