export type { LangLocale } from "./i18n/types";
export type { Lang, LangRegion, LangEntry } from "../../shared/langRegistry";
export {
  LANG_REGISTRY,
  LANG_REGION_ORDER,
  LANG_REGION_LABELS,
  SUPPORTED_LANGS,
  LEGACY_LANG_MAP,
  normalizeLang,
  isSupportedLang,
  resolveAppI18n,
  getLangEntry,
  getCountryName,
  getLanguageName,
  isRtlLang,
  getLangsByRegion,
  marketingCopyKey,
} from "../../shared/langRegistry";
