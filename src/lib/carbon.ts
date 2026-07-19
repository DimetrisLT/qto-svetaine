// Apytikslis anglies pėdsakas (embodied carbon, A1–A3) iš kiekių.
// Koeficientai – orientaciniai, sutraukti iš viešų šaltinių (ICE Database v3/v4,
// gamintojų EPD vidurkiai). Skirta ankstyvam palyginimui, ne sertifikuotam LCA.
import type { ElementCategory, QtoItem } from '@/types/qto';

export interface CarbonFactor {
  /** kg CO₂e už bazinį vienetą */
  factor: number;
  /** Bazinis vienetas, iš kurio skaičiuojama */
  basis: 'm3' | 'm2' | 'kg' | 'vnt';
  label: string;
}

/** Raktai: betonas, armatura, mūras, gipsas, mediena, izoliacija, stiklas, plienas */
export const CARBON_FACTORS: Record<string, CarbonFactor> = {
  concrete: { factor: 250, basis: 'm3', label: 'Betonas (C30/37)' },
  rebar: { factor: 1.4, basis: 'kg', label: 'Armatūrinis plienas' },
  masonry: { factor: 220, basis: 'm3', label: 'Mūras (keraminis)' },
  gypsum: { factor: 3.5, basis: 'm2', label: 'Gipso kartonas' },
  timber: { factor: 50, basis: 'm3', label: 'Mediena / medienos gaminiai' },
  insulation: { factor: 4, basis: 'm2', label: 'Šilumos izoliacija (~100 mm)' },
  glass: { factor: 20, basis: 'm2', label: 'Stiklas / stiklo paketas' },
  steel: { factor: 1.9, basis: 'kg', label: 'Konstrukcinis plienas' },
};

const MATERIAL_HINTS: [RegExp, keyof typeof CARBON_FACTORS][] = [
  [/beton|concrete|gelžbeton/i, 'concrete'],
  [/armat|rebar/i, 'rebar'],
  [/plien|steel/i, 'steel'],
  [/mūr|masonry|blok|plyt/i, 'masonry'],
  [/gips|gypsum|knauf/i, 'gypsum'],
  [/medin|medien|timber|wood|lankst/i, 'timber'],
  [/izoliac|insulat|vata|eps|polistirol|neopor/i, 'insulation'],
  [/stikl|glass/i, 'glass'],
];

/** Kategorijų → numatytoji medžiaga, kai material laukas tuščias */
const CATEGORY_DEFAULTS: Partial<Record<ElementCategory, keyof typeof CARBON_FACTORS>> = {
  column: 'concrete',
  beam: 'concrete',
  slab: 'concrete',
  footing: 'concrete',
  stair: 'concrete',
  wall: 'concrete',
  roof: 'timber',
  window: 'glass',
};

export interface ItemCarbon {
  kgCO2e: number;
  factorLabel: string;
  /** Iš kokio kiekio skaičiuota (pvz. „12,50 m³ × 250 kg/m³“) */
  basisText: string;
}

/** Įvertina vieną poziciją; null – jei nepavyko susieti su koeficientu */
export function estimateItemCarbon(item: QtoItem): ItemCarbon | null {
  let key: keyof typeof CARBON_FACTORS | null = null;
  if (item.material) {
    for (const [re, k] of MATERIAL_HINTS) {
      if (re.test(item.material)) { key = k; break; }
    }
  }
  if (!key) {
    // Armatūros pozicijos iš kompozitų: kg vienetas + „armatūra“ pavadinime
    if (item.unit === 'kg' && /armat|rebar/i.test(item.name)) key = 'rebar';
  }
  if (!key) key = CATEGORY_DEFAULTS[item.category] ?? null;
  if (!key) return null;
  const f = CARBON_FACTORS[key];

  let qty: number | null = null;
  let unitTxt = '';
  switch (f.basis) {
    case 'm3':
      if (item.volume_m3 !== undefined && item.volume_m3 > 0) { qty = item.volume_m3; unitTxt = 'm³'; }
      break;
    case 'm2':
      if (item.area_m2 !== undefined && item.area_m2 > 0) { qty = item.area_m2; unitTxt = 'm²'; }
      break;
    case 'kg':
      if (item.unit === 'kg' && item.count > 0) { qty = item.count; unitTxt = 'kg'; }
      else if (item.volume_m3 !== undefined && item.volume_m3 > 0) { qty = item.volume_m3 * 7850; unitTxt = 'kg (iš tūrio)'; }
      break;
    case 'vnt':
      qty = item.count;
      unitTxt = 'vnt.';
      break;
  }
  if (qty === null || qty <= 0) return null;
  return {
    kgCO2e: qty * f.factor,
    factorLabel: f.label,
    basisText: `${qty.toFixed(2)} ${unitTxt} × ${f.factor} kg CO₂e`,
  };
}

export interface CarbonSummary {
  totalKg: number;
  byCategory: { category: ElementCategory; kgCO2e: number }[];
  ratedCount: number;
  unratedCount: number;
}

/** Visa suvestinė projektui */
export function summarizeCarbon(items: QtoItem[]): CarbonSummary {
  const byCat = new Map<ElementCategory, number>();
  let total = 0, rated = 0, unrated = 0;
  for (const it of items) {
    const c = estimateItemCarbon(it);
    if (!c) { unrated++; continue; }
    rated++;
    total += c.kgCO2e;
    byCat.set(it.category, (byCat.get(it.category) ?? 0) + c.kgCO2e);
  }
  return {
    totalKg: total,
    byCategory: [...byCat.entries()]
      .map(([category, kgCO2e]) => ({ category, kgCO2e }))
      .sort((a, b) => b.kgCO2e - a.kgCO2e),
    ratedCount: rated,
    unratedCount: unrated,
  };
}
