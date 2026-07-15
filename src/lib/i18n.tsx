import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANGUAGES, DEFAULT_LANG, dirOf, isLang, type Lang, type LanguageMeta } from "@/locales/languages";
import en from "@/locales/en";
import ar from "@/locales/ar";
import ur from "@/locales/ur";
import es from "@/locales/es";
import fr from "@/locales/fr";
import de from "@/locales/de";
import zh from "@/locales/zh";
import hi from "@/locales/hi";
import pt from "@/locales/pt";
import ru from "@/locales/ru";
import ja from "@/locales/ja";
import tr from "@/locales/tr";

export type { Lang, LanguageMeta };
export { LANGUAGES };

// Per-language dictionaries, keyed by canonical English source string.
// Register a new language here after adding its file + registry entry.
export const dictionaries: Record<Lang, Record<string, string>> = {
  en, ar, ur, es, fr, de, zh, hi, pt, ru, ja, tr,
};

// Set of every canonical English key (used by the DOM auto-translator to decide
// whether a piece of text is something we know how to translate).
export const EN_KEYS: ReadonlySet<string> = new Set(Object.keys(en));

// Reverse index: any translated string (in any language) → its English key.
// Lets the auto-translator map a node that currently shows Arabic/Urdu back to
// its English source so it can re-translate when switching between languages.
const reverseIndex: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const lang of Object.keys(dictionaries) as Lang[]) {
    const d = dictionaries[lang];
    for (const key of Object.keys(d)) {
      const value = d[key];
      if (value && !map.has(value)) map.set(value, key);
    }
  }
  return map;
})();

/** Translate a known English key into the given language (falls back to the key). */
export function translateKey(englishKey: string, lang: Lang): string {
  return dictionaries[lang]?.[englishKey] ?? englishKey;
}

/** Resolve arbitrary rendered text back to its canonical English key, if known. */
export function toEnglishKey(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (EN_KEYS.has(trimmed)) return trimmed;
  return reverseIndex.get(trimmed) ?? null;
}

type Ctx = {
  lang: Lang;
  dir: "ltr" | "rtl";
  languages: LanguageMeta[];
  setLang: (l: Lang) => void;
  /** Cycle to the next language — kept for back-compat with the old toggle button. */
  toggle: () => void;
  t: (key: string) => string;
};

const I18nContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "baqala_lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLang(saved)) setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const dir = dirOf(lang);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* ignore */
      }
    }
  };

  const toggle = () => {
    const idx = LANGUAGES.findIndex((l) => l.code === lang);
    setLang(LANGUAGES[(idx + 1) % LANGUAGES.length].code);
  };

  const value = useMemo<Ctx>(
    () => ({
      lang,
      dir,
      languages: LANGUAGES,
      setLang,
      toggle,
      t: (key: string) => translateKey(key, lang),
    }),
    // setLang/toggle are stable closures over `lang`; re-create when lang changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, dir],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Safe fallback so components don't crash if used outside the provider
    return {
      lang: DEFAULT_LANG,
      dir: "ltr",
      languages: LANGUAGES,
      setLang: () => {},
      toggle: () => {},
      t: (k) => k,
    };
  }
  return ctx;
}
