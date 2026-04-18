import { createContext, useContext, type ReactNode } from "react";
import { translations, type Lang, type TranslationKey } from "./translations";

interface I18nContextValue {
  lang: Lang;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "en",
  t: (key) => translations.en[key],
});

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const t = (key: TranslationKey): string =>
    (translations[lang][key] ?? translations.en[key]) as string;
  return <I18nContext.Provider value={{ lang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
