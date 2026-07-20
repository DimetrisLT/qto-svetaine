import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import lt from './lt';
import en from './en';
import { getLocale, setLocale as storeSetLocale, type Locale } from './store';

const DICTS: Record<Locale, typeof lt> = { lt, en };

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: typeof lt;
}

const I18nContext = createContext<I18nValue>({ locale: getLocale(), setLocale: () => {}, t: DICTS[getLocale()] });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const value = useMemo<I18nValue>(() => ({
    locale,
    setLocale: (l: Locale) => { storeSetLocale(l); setLocaleState(l); },
    t: DICTS[locale],
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/** Kalbos perjungiklis (LT / EN) */
export function LangToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <button
      onClick={() => setLocale(locale === 'lt' ? 'en' : 'lt')}
      title={t.app.langTitle}
      className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {locale === 'lt' ? '🇱🇹 LT' : '🇺🇸 EN'}
    </button>
  );
}
