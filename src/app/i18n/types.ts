import type { APP_I18N } from "../i18n";

export type I18nBundle = (typeof APP_I18N)["en"];

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
