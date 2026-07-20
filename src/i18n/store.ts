// Kalbos būsena modulio lygmenyje – kad galėtų naudoti ir ne-React bibliotekos
// (works.ts, selfCheck.ts, assemblies.ts …). React pusę apgaubia I18nProvider.
export type Locale = 'en' | 'lt';

const KEY = 'qto-lang';
let current: Locale = detect();

function detect(): Locale {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'lt') return saved;
  } catch { /* ignore */ }
  // Numatytoji rinka – JAV (anglų kalba); lietuvių – tik kai naršyklė LT
  try {
    return navigator.language?.toLowerCase().startsWith('lt') ? 'lt' : 'en';
  } catch {
    return 'en';
  }
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(l: Locale) {
  current = l;
  try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  try { document.documentElement.lang = l; } catch { /* ignore */ }
}

/** Dvikalbis eilučių rinkiklis bibliotekoms (be React) */
export function L<T>(byLocale: { en: T; lt: T }): T {
  return current === 'lt' ? byLocale.lt : byLocale.en;
}
