// Bendri QTO (kiekių surinkimo) tipai visiems failų formatams

import { L } from '@/i18n/store';

export type SourceType = 'IFC' | 'PDF' | 'DXF';

export type ElementCategory =
  | 'wall'
  | 'slab'
  | 'column'
  | 'beam'
  | 'door'
  | 'window'
  | 'stair'
  | 'roof'
  | 'footing'
  | 'room'
  | 'fin_wall'
  | 'fin_floor'
  | 'fin_ceiling'
  | 'other';

export type MeasureUnit = 'vnt.' | 'm' | 'm²' | 'm³' | 'kg';

/** Kiekio kilmė: 'project' – projekto duomenys (iš brėžinių lentelių / IFC Qto), 'ai' – skaičiuota AI */
export type QuantityOrigin = 'ai' | 'project';

export const ORIGIN_INFO: Record<QuantityOrigin, { lt: string; en: string; short: string }> = {
  project: { lt: 'Projekto duomenys', en: 'Project data', short: 'proj.' },
  ai: { lt: 'Skaičiuota AI', en: 'AI calculated', short: 'AI' },
};

/** Kilmės etiketė pagal aktyvią kalbą (seni duomenys be origin – saugus numanymas) */
export function originLabel(origin: QuantityOrigin | undefined): string {
  const o = ORIGIN_INFO[origin ?? 'ai'] ?? ORIGIN_INFO.ai;
  return L({ lt: o.lt, en: o.en });
}

export interface QtoItem {
  id: string;
  source: SourceType;
  category: ElementCategory;
  ifcClass?: string;
  /** IFC elemento expressID – 3D vaizdo ir žiniaraščio susiejimui */
  ifcExpressId?: number;
  /** Tikrinimo būsena: sąmatininkas patvirtino poziciją */
  verified?: boolean;
  name: string;
  material?: string;
  length_m?: number;
  width_m?: number;
  height_m?: number;
  thickness_m?: number;
  area_m2?: number;
  volume_m3?: number;
  count: number;
  unit: MeasureUnit;
  /** Masa kg (armatūrai, metalui) */
  mass_kg?: number;
  /** Kiekio kilmė: projekto duomenys arba AI skaičiavimas */
  origin: QuantityOrigin;
  /** IFC deklaruotas tūris iš Qto rinkinių (savikontrolei) */
  declaredVolume_m3?: number;
  /** Tūris, apskaičiuotas iš geometrinio modelio (savikontrolei) */
  meshVolume_m3?: number;
  /** PDF matavimo duomenys (figūrų atvaizdavimui ant brėžinio) */
  pdfKind?: 'length' | 'area' | 'count';
  pdfPoints?: Array<{ x: number; y: number }>;
  pdfPage?: number;
  /** PDF: kuriam projekto failui priklauso matavimas */
  pdfFile?: string;
  /** Projekto dalis (A, SK, VK, E, Š, V, T, Kita) */
  discipline?: string;
  note?: string;
  /** OCR žiniaraščio „VISO“ eilutės kandidatinės sumos (trianguliacijai) */
  visoCandidates?: number[];
}

/** Projekto dalys (disciplines) */
export const DISCIPLINES: Array<{ code: string; lt: string; en: string }> = [
  { code: 'A', lt: 'Architektūra', en: 'Architectural' },
  { code: 'SK', lt: 'Statybinės konstrukcijos', en: 'Structural' },
  { code: 'VK', lt: 'Vandentiekis / kanalizacija', en: 'Plumbing' },
  { code: 'Š', lt: 'Šildymas', en: 'Heating' },
  { code: 'V', lt: 'Vėdinimas', en: 'Ventilation' },
  { code: 'E', lt: 'Elektra', en: 'Electrical' },
  { code: 'T', lt: 'Technologinė dalis', en: 'Process' },
  { code: 'Kita', lt: 'Kita', en: 'Other' },
];

/** Disciplinos pavadinimas pagal aktyvią kalbą */
export function disciplineLabel(code: string): string {
  const d = DISCIPLINES.find((x) => x.code === code);
  if (!d) return code;
  return L({ lt: d.lt, en: d.en });
}

/** Automatinis dalies atpažinimas iš failo pavadinimo */
export function detectDiscipline(fileName: string): string {
  const n = fileName.toUpperCase();
  // „Žodžio“ ribos: _, -, tarpai, skaičiai laikomi skirtukais (pvz., „A_20260119“)
  const word = (c: string) => new RegExp(`(^|[^A-Z0-9ŠĖ])${c}([^A-Z0-9ŠĖ]|$)`).test(n);
  if (word('SK') || /KONSTRUK/.test(n)) return 'SK';
  if (word('VK') || /VANDEN|KANALIZ/.test(n)) return 'VK';
  if (word('Š') || /ŠILD|SILDY/.test(n)) return 'Š';
  if (word('V') || /VĖDIN|VENTIL/.test(n)) return 'V';
  if (word('E') || /ELEKTR/.test(n)) return 'E';
  if (word('T') || /TECHNOLOG/.test(n)) return 'T';
  if (word('A') || /ARCHITEKT/.test(n)) return 'A';
  return 'Kita';
}

export interface CheckResult {
  id: string;
  group: 'geometry' | 'logic' | 'completeness';
  label: string;
  status: 'ok' | 'warn';
  details: string;
}

export interface SourceMeta {
  source: SourceType;
  fileName?: string;
  parsed: boolean;
  /** IFC: viso elementų modelyje */
  totalElements?: number;
  /** IFC: elementai be kiekių (Qto) savybių */
  withoutQuantities?: number;
  withoutQuantitiesClasses?: string[];
  /** IFC: matavimo vienetų koeficientas į metrus */
  unitFactor?: number;
  unitLabel?: string;
  /** IFC: patalpų (IfcSpace) bendras plotas m² */
  spaceArea_m2?: number;
  /** PDF: ar sukalibruotas mastelis */
  scaleCalibrated?: boolean;
  /** PDF: projekto failų sąrašas su kalibravimo būsena */
  pdfFiles?: Array<{
    id: string; name: string; discipline: string; calibrated: boolean;
    /** Rankiniu būdu sukalibruota vienetų/m */
    upm?: number | null;
    /** Automatiškai aptikta vienetų/m (iš mastelio žymos + lapo formato) */
    detectedUpm?: number | null;
    /** Skirtingas mastelis atskiriems puslapiams: puslapio nr. → vienetų/m */
    upmByPage?: Record<number, number> | null;
  }>;
  /** DXF: sluoksniai, nepriskirti jokiai kategorijai */
  unassignedLayers?: string[];
  /** DXF: vienetų koeficientas į metrus */
  dxfUnitFactor?: number;
}

export interface CategoryInfo {
  lt: string;
  en: string;
  color: string;
}

export const CATEGORY_INFO: Record<ElementCategory, CategoryInfo> = {
  wall: { lt: 'Sienos', en: 'Walls', color: '#3b82f6' },
  slab: { lt: 'Perdangos', en: 'Slabs', color: '#f59e0b' },
  column: { lt: 'Kolonos', en: 'Columns', color: '#ef4444' },
  beam: { lt: 'Sijos', en: 'Beams', color: '#8b5cf6' },
  door: { lt: 'Durys', en: 'Doors', color: '#10b981' },
  window: { lt: 'Langai', en: 'Windows', color: '#06b6d4' },
  stair: { lt: 'Laiptai', en: 'Stairs', color: '#ec4899' },
  roof: { lt: 'Stogas', en: 'Roof', color: '#84cc16' },
  footing: { lt: 'Pamatų elementai', en: 'Foundations', color: '#b45309' },
  room: { lt: 'Patalpos', en: 'Rooms', color: '#64748b' },
  fin_wall: { lt: 'Sienų apdaila', en: 'Wall finish', color: '#fb923c' },
  fin_floor: { lt: 'Grindų apdaila', en: 'Floor finish', color: '#eab308' },
  fin_ceiling: { lt: 'Lubų apdaila', en: 'Ceiling finish', color: '#c084fc' },
  other: { lt: 'Kita', en: 'Other', color: '#9ca3af' },
};

/** Kategorijos etiketė pagal aktyvią kalbą */
export function categoryLabel(cat: ElementCategory): string {
  const c = CATEGORY_INFO[cat];
  return c ? L({ lt: c.lt, en: c.en }) : cat;
}

export const CATEGORY_ORDER: ElementCategory[] = [
  'wall', 'slab', 'column', 'beam', 'roof', 'stair',
  'footing', 'door', 'window', 'fin_wall', 'fin_floor', 'fin_ceiling', 'room', 'other',
];

let counter = 0;
export function uid(): string {
  counter += 1;
  return `qto_${Date.now().toString(36)}_${counter}`;
}
