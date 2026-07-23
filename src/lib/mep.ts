/**
 * MEP (instaliacijų) simbolių tipai ir preliminarinės normos kabeliams/vamzdžiams.
 * Normos – LT praktikos vidurkiai (m tiesioginio tinklo vienam prijungimo taškui),
 * redaguojamos vartotojo prieš įtraukiant.
 */
import { L } from '@/i18n/store';

export interface MepType {
  id: string;
  /** Pozicijos pavadinimas (daugiskaita) */
  label: () => string;
  /** Preliminarus tinklas: ką skaičiuojame ir norma m/vnt. */
  prelim?: {
    label: () => string;
    defaultNorm: number; // m vienam taškui
  };
}

export const MEP_TYPES: MepType[] = [
  { id: 'other', label: () => L({ lt: 'Simboliai (kita)', en: 'Symbols (other)' }) },
  // --- Elektra ---
  {
    id: 'rozete',
    label: () => L({ lt: 'Elektros rozetės', en: 'Power sockets' }),
    prelim: { label: () => L({ lt: 'Kabeliai (preliminarūs)', en: 'Cables (preliminary)' }), defaultNorm: 9 },
  },
  {
    id: 'jungiklis',
    label: () => L({ lt: 'Jungikliai', en: 'Switches' }),
    prelim: { label: () => L({ lt: 'Kabeliai (preliminarūs)', en: 'Cables (preliminary)' }), defaultNorm: 8 },
  },
  {
    id: 'sviestuvas',
    label: () => L({ lt: 'Šviestuvai', en: 'Light fixtures' }),
    prelim: { label: () => L({ lt: 'Kabeliai (preliminarūs)', en: 'Cables (preliminary)' }), defaultNorm: 10 },
  },
  // --- Vandentiekis / šildymas ---
  {
    id: 'kranas',
    label: () => L({ lt: 'Maišytuvai / kranai', en: 'Taps / faucets' }),
    prelim: { label: () => L({ lt: 'Vamzdžiai (preliminarūs)', en: 'Pipes (preliminary)' }), defaultNorm: 4 },
  },
  {
    id: 'praustuvas',
    label: () => L({ lt: 'Praustuvės', en: 'Washbasins' }),
    prelim: { label: () => L({ lt: 'Vamzdžiai (preliminarūs)', en: 'Pipes (preliminary)' }), defaultNorm: 4 },
  },
  {
    id: 'dusas',
    label: () => L({ lt: 'Dušai', en: 'Showers' }),
    prelim: { label: () => L({ lt: 'Vamzdžiai (preliminarūs)', en: 'Pipes (preliminary)' }), defaultNorm: 4 },
  },
  {
    id: 'klozetas',
    label: () => L({ lt: 'Klozetai', en: 'WCs' }),
    prelim: { label: () => L({ lt: 'Vamzdžiai (preliminarūs)', en: 'Pipes (preliminary)' }), defaultNorm: 5 },
  },
  {
    id: 'radiatorius',
    label: () => L({ lt: 'Radiatoriai', en: 'Radiators' }),
    prelim: { label: () => L({ lt: 'Šildymo vamzdžiai (preliminarūs)', en: 'Heating pipes (preliminary)' }), defaultNorm: 6 },
  },
  {
    id: 'boileris',
    label: () => L({ lt: 'Boileriai', en: 'Boilers' }),
    prelim: { label: () => L({ lt: 'Vamzdžiai (preliminarūs)', en: 'Pipes (preliminary)' }), defaultNorm: 8 },
  },
];

export function mepTypeById(id: string): MepType {
  return MEP_TYPES.find((t) => t.id === id) ?? MEP_TYPES[0];
}

// ---- Normų išsaugojimas (vartotojo pataisytos m/vnt. reikšmės) ----
const NORM_KEY = 'qto-mep-norms';

export function loadNorms(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(NORM_KEY) ?? '{}'); } catch { return {}; }
}

export function normFor(typeId: string): number | null {
  const t = mepTypeById(typeId);
  if (!t.prelim) return null;
  const saved = loadNorms()[typeId];
  return typeof saved === 'number' && saved > 0 ? saved : t.prelim.defaultNorm;
}

export function saveNorm(typeId: string, norm: number): void {
  const all = loadNorms();
  all[typeId] = norm;
  localStorage.setItem(NORM_KEY, JSON.stringify(all));
}
