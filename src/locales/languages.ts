// Language registry — the single source of truth for which languages the app
// supports, how they are labelled, and their text direction. Add a new language
// by (1) appending an entry here and (2) creating a matching src/locales/<code>.ts
// dictionary file. Nothing else needs to change.

export type Lang = "en" | "ar" | "ur" | "es" | "fr" | "de" | "zh" | "hi" | "pt" | "ru" | "ja" | "tr";

export type LanguageMeta = {
  code: Lang;
  /** English name, used in menus/settings */
  label: string;
  /** Name written in its own script, shown as the primary label */
  nativeLabel: string;
  /** Short code shown in the compact navbar button */
  short: string;
  dir: "ltr" | "rtl";
};

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", label: "English",    nativeLabel: "English",  short: "EN", dir: "ltr" },
  { code: "ar", label: "Arabic",     nativeLabel: "العربية",  short: "AR", dir: "rtl" },
  { code: "ur", label: "Urdu",       nativeLabel: "اردو",      short: "UR", dir: "rtl" },
  { code: "es", label: "Spanish",    nativeLabel: "Español",  short: "ES", dir: "ltr" },
  { code: "fr", label: "French",     nativeLabel: "Français", short: "FR", dir: "ltr" },
  { code: "de", label: "German",     nativeLabel: "Deutsch",  short: "DE", dir: "ltr" },
  { code: "zh", label: "Chinese",    nativeLabel: "中文",      short: "ZH", dir: "ltr" },
  { code: "hi", label: "Hindi",      nativeLabel: "हिन्दी",     short: "HI", dir: "ltr" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português", short: "PT", dir: "ltr" },
  { code: "ru", label: "Russian",    nativeLabel: "Русский",  short: "RU", dir: "ltr" },
  { code: "ja", label: "Japanese",   nativeLabel: "日本語",     short: "JA", dir: "ltr" },
  { code: "tr", label: "Turkish",    nativeLabel: "Türkçe",   short: "TR", dir: "ltr" },
];

export const DEFAULT_LANG: Lang = "en";

export function dirOf(lang: Lang): "ltr" | "rtl" {
  return LANGUAGES.find((l) => l.code === lang)?.dir ?? "ltr";
}

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && LANGUAGES.some((l) => l.code === value);
}
