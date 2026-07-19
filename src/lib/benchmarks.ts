// Kiekių rodiklių „sveiko proto“ patikra (benchmark savikontrolė).
// Santykiniai rodikliai lyginami su tipiniais diapazonais – sugavo eilinio dydžio
// klaidas (pvz., 10× neteisingas mastelis), kurių nemato jokia geometrinė patikra.
// Diapazonai – orientaciniai (gyvenamieji/administraciniai pastatai), konfigūruojami.
import type { QtoItem } from '@/types/qto';
import { fmt } from '@/lib/format';

export interface BenchmarkResult {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  range: [number, number];
  status: 'ok' | 'warn' | 'na';
  details: string;
}

const STRUCT = new Set(['wall', 'slab', 'column', 'beam', 'footing']);
const has = (re: RegExp, i: QtoItem) => re.test(`${i.name} ${i.material ?? ''}`);
const volOf = (i: QtoItem) => i.volume_m3 ?? (i.unit === 'm³' ? i.count : 0);
const areaOf = (i: QtoItem) => i.area_m2 ?? (i.unit === 'm²' ? i.count : 0);
const massOf = (i: QtoItem) => i.mass_kg ?? (i.unit === 'kg' ? i.count : 0);

export interface BenchmarkTotals {
  concrete_m3: number;
  rebar_kg: number;
  formwork_m2: number;
  floorArea_m2: number;
  wallFinish_m2: number;
}

/** Suveda bazinius kiekius rodikliams (be dvigubo skaičiavimo – kiekviena eilutė vieną kartą) */
export function computeTotals(items: QtoItem[]): BenchmarkTotals {
  let concrete = 0, rebar = 0, formwork = 0, slabArea = 0, finFloor = 0, wallFinish = 0;
  for (const i of items) {
    if (i.unit === 'm³' && STRUCT.has(i.category) && (volOf(i) > 0)) concrete += volOf(i);
    if ((i.unit === 'kg' || (i.mass_kg ?? 0) > 0) && has(/armat/i, i)) rebar += massOf(i);
    if (i.unit === 'm²' && has(/kofan/i, i)) formwork += areaOf(i);
    if (i.category === 'slab') slabArea += areaOf(i);
    if (i.category === 'fin_floor') finFloor += areaOf(i);
    if (i.category === 'fin_wall' || (i.unit === 'm²' && has(/tink|sienų apdaila/i, i))) wallFinish += areaOf(i);
  }
  return {
    concrete_m3: concrete,
    rebar_kg: rebar,
    formwork_m2: formwork,
    floorArea_m2: slabArea > 0 ? slabArea : finFloor,
    wallFinish_m2: wallFinish,
  };
}

interface Rule {
  id: string;
  label: string;
  unit: string;
  range: [number, number];
  typical: string;
  compute: (t: BenchmarkTotals) => number | null;
}

export const BENCHMARK_RULES: Rule[] = [
  {
    id: 'concrete_per_floor',
    label: 'Betonas / grindų plotas',
    unit: 'm³/m²',
    range: [0.12, 0.8],
    typical: '0,25–0,55 m³/m² (gyv./admin. pastatai)',
    compute: (t) => (t.concrete_m3 > 0 && t.floorArea_m2 > 0 ? t.concrete_m3 / t.floorArea_m2 : null),
  },
  {
    id: 'rebar_per_concrete',
    label: 'Armatūra / betonas',
    unit: 'kg/m³',
    range: [30, 320],
    typical: '80–200 kg/m³ (sijos iki ~300, kolonos iki ~450)',
    compute: (t) => (t.rebar_kg > 0 && t.concrete_m3 > 0 ? t.rebar_kg / t.concrete_m3 : null),
  },
  {
    id: 'formwork_per_concrete',
    label: 'Kofanas / betonas',
    unit: 'm²/m³',
    range: [3.5, 15],
    typical: '6–11 m²/m³ (karkasiniai pastatai)',
    compute: (t) => (t.formwork_m2 > 0 && t.concrete_m3 > 0 ? t.formwork_m2 / t.concrete_m3 : null),
  },
  {
    id: 'wallfinish_per_floor',
    label: 'Sienų apdaila / grindų plotas',
    unit: 'm²/m²',
    range: [0.8, 4.0],
    typical: '1,8–3,0 m²/m²',
    compute: (t) => (t.wallFinish_m2 > 0 && t.floorArea_m2 > 0 ? t.wallFinish_m2 / t.floorArea_m2 : null),
  },
];

/** Apskaičiuoja visus rodiklius; 'na' – nepakanka duomenų (rodiklis praleidžiamas) */
export function computeBenchmarks(items: QtoItem[]): BenchmarkResult[] {
  const t = computeTotals(items);
  return BENCHMARK_RULES.map((r) => {
    const v = r.compute(t);
    if (v === null) {
      return { id: r.id, label: r.label, value: null, unit: r.unit, range: r.range, status: 'na' as const, details: '' };
    }
    const ok = v >= r.range[0] && v <= r.range[1];
    return {
      id: r.id,
      label: r.label,
      value: v,
      unit: r.unit,
      range: r.range,
      status: ok ? ('ok' as const) : ('warn' as const),
      details: ok
        ? `${fmt(v, 2)} ${r.unit} – tipiniame diapazone (${r.typical}).`
        : `${fmt(v, 2)} ${r.unit} – UŽ tipinio diapazono (${r.typical}). Patikrinkite mastelius ir apimtis – galima eilinio dydžio klaida.`,
    };
  });
}
