import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';

const KEY = 'qto-theme';

/** Pritaiko išsaugotą (arba sistemos) temą prieš pirmą vaizdavimą – be „blykstės“ */
export function applyStoredTheme() {
  try {
    const t = localStorage.getItem(KEY);
    const dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch {
    /* localStorage nepasiekiamas – lieka šviesi */
  }
}

/** Saulė/mėnulis – šviesus ↔ tamsus („blueprint“) režimas */
export default function ThemeToggle() {
  const { t } = useI18n();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem(KEY, next ? 'dark' : 'light'); } catch { /* ignore */ }
  };
  return (
    <button
      onClick={toggle}
      title={dark ? t.app.themeLight : t.app.themeDark}
      className="flex items-center rounded-lg border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}
