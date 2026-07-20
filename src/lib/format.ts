// Skaičių formatavimas (pagal kalbą: LT kablelis / EN taškas)

import { getLocale } from '@/i18n/store';
import { convertUnitLabel, convertValue, getUnitSystem, type UnitSystem } from '@/lib/units';

export function fmt(n: number | undefined, digits = 2): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString(getLocale() === 'lt' ? 'lt-LT' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function fmtDim(n: number | undefined): string {
  return fmt(n, 3);
}

/** Suapvalina iki protingo skaitmens skaičiaus */
export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Kiekio formatavimas su vienetų konversija (m → ft ir t.t.) */
export function fmtQty(n: number | undefined, unit: string, digits = 2, system: UnitSystem = getUnitSystem()): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return fmt(convertValue(n, unit, system), digits);
}

/** Vieneto žymė pagal aktyvią vienetų sistemą */
export function uLabel(unit: string, system: UnitSystem = getUnitSystem()): string {
  return convertUnitLabel(unit, system);
}
