import { Languages, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";

/**
 * Navbar language picker. Lists every language from the registry with its native
 * label; selecting one switches the whole UI (and RTL direction) immediately.
 */
export function LanguageSwitcher() {
  const { lang, languages, setLang, t } = useI18n();
  const current = languages.find((l) => l.code === lang);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* data-no-i18n: language names must always render in their own script,
            never be translated by the DOM auto-translator. */}
        <Button variant="outline" size="sm" className="gap-1.5 h-9" data-no-i18n data-tour="lang-switcher" aria-label={t("Language")} title={t("Language")}>
          <Languages className="h-4 w-4" />
          <span className="hidden sm:inline font-semibold">{current?.short ?? "EN"}</span>
          <span className="hidden md:inline text-xs text-muted-foreground">· {current?.nativeLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" data-no-i18n>
        <DropdownMenuLabel className="flex items-center gap-2">
          <Languages className="h-3.5 w-3.5 text-primary" /> {t("Language")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {languages.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onSelect={() => setLang(l.code)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span className="flex-1" dir={l.dir}>
              <span className="font-medium">{l.nativeLabel}</span>
              {l.nativeLabel !== l.label && (
                <span className="text-xs text-muted-foreground ltr:ml-1.5 rtl:mr-1.5">{l.label}</span>
              )}
            </span>
            {lang === l.code && <Check className="h-4 w-4 text-primary shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
