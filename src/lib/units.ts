// Matavimo vienetų sistemos: metrinė (numatytoji LT) ir imperinė (JAV).
// Vidiniai skaičiavimai visada metriniai – konvertuojama tik RODYMOJE.
import { useSyncExternalStore } from 'react';
import { getLocale } from '@/i18n/store';

export type UnitSystem = 'metric' | 'imperial';

const KEY = 'qto-units';

const M_TO_FT = 3.280839895;
const M2_TO_FT2 = 10.763910417;
const M3_TO_FT3 = 35.314666721;
const KG_TO_LB = 2.204622622;

let current: UnitSystem | null = null;
const listeners = new Set<() => void>();

export function getUnitSystem(): UnitSystem {
  if (current) return current;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'metric' || saved === 'imperial') {
      current = saved;
      return saved;
    }
  } catch { /* ignore */ }
  // JAV vartotojui (EN kalba) – imperiniai; kitur – metriniai
  return getLocale() === 'lt' ? 'metric' : 'imperial';
}

export function setUnitSystem(u: UnitSystem) {
  current = u;
  try { localStorage.setItem(KEY, u); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** React hook – komponentai persipiešia perjungus m / ft */
export function useUnitSystem(): UnitSystem {
  return useSyncExternalStore(subscribe, getUnitSystem);
}

/** Vieneto žymos konversija rodymui */
export function convertUnitLabel(unit: string, system: UnitSystem = getUnitSystem()): string {
  if (system === 'metric') return unit;
  switch (unit) {
    case 'm': return 'ft';
    case 'm²': return 'ft²';
    case 'm³': return 'ft³';
    case 'kg': return 'lb';
    case 'kg/m³': return 'lb/ft³';
    case 'vnt.': return 'pcs';
    default: return unit;
  }
}

/** Reikšmės konversija rodymui (iš metrinės canonical) */
export function convertValue(value: number, unit: string, system: UnitSystem = getUnitSystem()): number {
  if (system === 'metric') return value;
  switch (unit) {
    case 'm': return value * M_TO_FT;
    case 'm²': return value * M2_TO_FT2;
    case 'm³': return value * M3_TO_FT3;
    case 'kg': return value * KG_TO_LB;
    default: return value;
  }
}

/** Atvirkštinė konversija – vartotojo įvestis (imperinė) → metrinė canonical */
export function toMeters(value: number, unit: string, system: UnitSystem = getUnitSystem()): number {
  if (system === 'metric') return value;
  switch (unit) {
    case 'm': return value / M_TO_FT;
    case 'm²': return value / M2_TO_FT2;
    case 'm³': return value / M3_TO_FT3;
    default: return value;
  }
}
