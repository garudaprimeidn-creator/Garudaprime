export type LangLocale =
  | "id"
  | "en"
  | "ms"
  | "th"
  | "vi"
  | "fil"
  | "km"
  | "lo"
  | "bur"
  | "pt"
  | "hi"
  | "bn"
  | "ur"
  | "ta"
  | "ne"
  | "ar"
  | "fr"
  | "sw"
  | "am"
  | "ha";

export type Lang =
  | "id"
  | "gb"
  | "bd"
  | "in"
  | "pk"
  | "ph"
  | "vn"
  | "cn"
  | "bj"
  | "bf"
  | "bi"
  | "ci"
  | "cg"
  | "nr"
  | "ng"
  | "tg"
  | "rw"
  | "tz"
  | "qa";

export type LangRegion =
  | "primary"
  | "asean"
  | "south_asia"
  | "africa_west"
  | "africa_central"
  | "africa"
  | "asia"
  | "middle_east";

export type LangEntry = {
  code: Lang;
  countryCode: string;
  countryNameId: string;
  countryNameEn: string;
  languageNameId: string;
  languageNameEn: string;
  region: LangRegion;
  rtl?: boolean;
  i18nKey: LangLocale;
};

export const LEGACY_LANG_MAP: Record<string, Lang> = {
  en: "gb",
  ar: "qa",
  sa: "qa",
  zh: "cn",
  ja: "cn",
  ko: "cn",
  my: "id",
  sg: "id",
  th: "id",
  bn: "id",
  kh: "id",
  la: "id",
  mm: "id",
  tl: "id",
  lk: "in",
  np: "in",
  mv: "in",
  gh: "ng",
  sn: "ci",
  ml: "bf",
  gn: "ci",
  lr: "ng",
  sl: "ng",
  gm: "ng",
  cv: "cg",
  mr: "nr",
  cm: "cg",
  cd: "cg",
  cf: "cg",
  ga: "cg",
  gq: "cg",
  td: "cg",
  ao: "cg",
  st: "cg",
  ke: "tz",
  et: "tz",
  eg: "tz",
  ma: "nr",
  dz: "nr",
  za: "tz",
  mz: "tz",
  jp: "cn",
  kr: "cn",
};

export const LANG_REGISTRY: LangEntry[] = [
  { code: "id", countryCode: "ID", countryNameId: "Indonesia", countryNameEn: "Indonesia", languageNameId: "Bahasa Indonesia", languageNameEn: "Indonesian", region: "primary", i18nKey: "id" },
  { code: "gb", countryCode: "GB", countryNameId: "Britania Raya", countryNameEn: "United Kingdom", languageNameId: "English", languageNameEn: "English", region: "primary", i18nKey: "en" },

  { code: "ph", countryCode: "PH", countryNameId: "Filipina", countryNameEn: "Philippines", languageNameId: "Filipino", languageNameEn: "Filipino", region: "asean", i18nKey: "fil" },
  { code: "vn", countryCode: "VN", countryNameId: "Vietnam", countryNameEn: "Vietnam", languageNameId: "Tiếng Việt", languageNameEn: "Vietnamese", region: "asean", i18nKey: "vi" },

  { code: "bd", countryCode: "BD", countryNameId: "Bangladesh", countryNameEn: "Bangladesh", languageNameId: "বাংলা", languageNameEn: "Bengali", region: "south_asia", i18nKey: "bn" },
  { code: "in", countryCode: "IN", countryNameId: "India", countryNameEn: "India", languageNameId: "हिन्दी", languageNameEn: "Hindi", region: "south_asia", i18nKey: "hi" },
  { code: "pk", countryCode: "PK", countryNameId: "Pakistan", countryNameEn: "Pakistan", languageNameId: "اردو", languageNameEn: "Urdu", region: "south_asia", rtl: true, i18nKey: "ur" },

  { code: "bj", countryCode: "BJ", countryNameId: "Benin", countryNameEn: "Benin", languageNameId: "Français", languageNameEn: "French", region: "africa_west", i18nKey: "fr" },
  { code: "bf", countryCode: "BF", countryNameId: "Burkina Faso", countryNameEn: "Burkina Faso", languageNameId: "Français", languageNameEn: "French", region: "africa_west", i18nKey: "fr" },
  { code: "ci", countryCode: "CI", countryNameId: "Pantai Gading", countryNameEn: "Côte d'Ivoire", languageNameId: "Français", languageNameEn: "French", region: "africa_west", i18nKey: "fr" },
  { code: "nr", countryCode: "NE", countryNameId: "Niger", countryNameEn: "Niger", languageNameId: "Français · Hausa", languageNameEn: "French · Hausa", region: "africa_west", i18nKey: "fr" },
  { code: "ng", countryCode: "NG", countryNameId: "Nigeria", countryNameEn: "Nigeria", languageNameId: "Hausa · English", languageNameEn: "Hausa · English", region: "africa_west", i18nKey: "ha" },
  { code: "tg", countryCode: "TG", countryNameId: "Togo", countryNameEn: "Togo", languageNameId: "Français", languageNameEn: "French", region: "africa_west", i18nKey: "fr" },

  { code: "cg", countryCode: "CG", countryNameId: "Kongo", countryNameEn: "Congo", languageNameId: "Français", languageNameEn: "French", region: "africa_central", i18nKey: "fr" },

  { code: "bi", countryCode: "BI", countryNameId: "Burundi", countryNameEn: "Burundi", languageNameId: "Français · Kirundi", languageNameEn: "French · Kirundi", region: "africa", i18nKey: "fr" },
  { code: "rw", countryCode: "RW", countryNameId: "Rwanda", countryNameEn: "Rwanda", languageNameId: "Kinyarwanda · English", languageNameEn: "Kinyarwanda · English", region: "africa", i18nKey: "en" },
  { code: "tz", countryCode: "TZ", countryNameId: "Tanzania", countryNameEn: "Tanzania", languageNameId: "Kiswahili · English", languageNameEn: "Swahili · English", region: "africa", i18nKey: "sw" },

  { code: "cn", countryCode: "CN", countryNameId: "Tiongkok", countryNameEn: "China", languageNameId: "中文", languageNameEn: "Chinese", region: "asia", i18nKey: "en" },

  { code: "qa", countryCode: "QA", countryNameId: "Qatar", countryNameEn: "Qatar", languageNameId: "العربية", languageNameEn: "Arabic", region: "middle_east", rtl: true, i18nKey: "ar" },
];

export const LANG_REGION_ORDER: LangRegion[] = [
  "primary",
  "asean",
  "south_asia",
  "africa_west",
  "africa_central",
  "africa",
  "asia",
  "middle_east",
];

export const LANG_REGION_LABELS: Record<LangRegion, { id: string; en: string }> = {
  primary: { id: "Utama", en: "Primary" },
  asean: { id: "Asia Tenggara", en: "Southeast Asia" },
  south_asia: { id: "Asia Selatan", en: "South Asia" },
  africa_west: { id: "Afrika Barat", en: "West Africa" },
  africa_central: { id: "Afrika Tengah", en: "Central Africa" },
  africa: { id: "Afrika Timur", en: "East Africa" },
  asia: { id: "Asia Timur", en: "East Asia" },
  middle_east: { id: "Timur Tengah", en: "Middle East" },
};

export const SUPPORTED_LANGS = LANG_REGISTRY.map((entry) => entry.code);

export function normalizeLang(value: string | null | undefined): Lang {
  if (!value) return "id";
  if (SUPPORTED_LANGS.includes(value as Lang)) return value as Lang;
  return LEGACY_LANG_MAP[value] ?? "id";
}

export function isSupportedLang(value: string | null | undefined): value is Lang {
  return !!value && (SUPPORTED_LANGS.includes(value as Lang) || value in LEGACY_LANG_MAP);
}

export function resolveAppI18n(lang: Lang): LangLocale {
  return LANG_REGISTRY.find((entry) => entry.code === lang)?.i18nKey ?? "en";
}

export function getLangEntry(code: Lang): LangEntry {
  return LANG_REGISTRY.find((entry) => entry.code === code) ?? LANG_REGISTRY[0];
}

export function getCountryName(entry: LangEntry, ui: LangLocale): string {
  return ui === "id" ? entry.countryNameId : entry.countryNameEn;
}

export function getLanguageName(entry: LangEntry, ui: LangLocale): string {
  return ui === "id" ? entry.languageNameId : entry.languageNameEn;
}

export function isRtlLang(lang: Lang): boolean {
  return getLangEntry(lang).rtl === true;
}

export function getLangsByRegion(region: LangRegion): LangEntry[] {
  return LANG_REGISTRY.filter((entry) => entry.region === region);
}

export function marketingCopyKey(lang: Lang): "id" | "en" {
  return resolveAppI18n(lang) === "id" ? "id" : "en";
}
