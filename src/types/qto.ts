// Bendri QTO (kiekių surinkimo) tipai visiems failų formatams

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

export const ORIGIN_INFO: Record<QuantityOrigin, { lt: string; short: string }> = {
  project: { lt: 'Projekto duomenys', short: 'proj.' },
  ai: { lt: 'Skaičiuota AI', short: 'AI' },
};

export interface QtoItem {
  id: string;
  source: SourceType;
  category: ElementCategory;
  ifcClass?: string;
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
export const DISCIPLINES: Array<{ code: string; lt: string }> = [
  { code: 'A', lt: 'Architektūra' },
  { code: 'SK', lt: 'Statybinės konstrukcijos' },
  { code: 'VK', lt: 'Vandentiekis / kanalizacija' },
  { code: 'Š', lt: 'Šildymas' },
  { code: 'V', lt: 'Vėdinimas' },
  { code: 'E', lt: 'Elektra' },
  { code: 'T', lt: 'Technologinė dalis' },
  { code: 'Kita', lt: 'Kita' },
];

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
  }>;
  /** DXF: sluoksniai, nepriskirti jokiai kategorijai */
  unassignedLayers?: string[];
  /** DXF: vienetų koeficientas į metrus */
  dxfUnitFactor?: number;
}

export interface CategoryInfo {
  lt: string;
  color: string;
}

export const CATEGORY_INFO: Record<ElementCategory, CategoryInfo> = {
  wall: { lt: 'Sienos', color: '#3b82f6' },
  slab: { lt: 'Perdangos', color: '#f59e0b' },
  column: { lt: 'Kolonos', color: '#ef4444' },
  beam: { lt: 'Sijos', color: '#8b5cf6' },
  door: { lt: 'Durys', color: '#10b981' },
  window: { lt: 'Langai', color: '#06b6d4' },
  stair: { lt: 'Laiptai', color: '#ec4899' },
  roof: { lt: 'Stogas', color: '#84cc16' },
  footing: { lt: 'Pamatų elementai', color: '#b45309' },
  room: { lt: 'Patalpos', color: '#64748b' },
  fin_wall: { lt: 'Sienų apdaila', color: '#fb923c' },
  fin_floor: { lt: 'Grindų apdaila', color: '#eab308' },
  fin_ceiling: { lt: 'Lubų apdaila', color: '#c084fc' },
  other: { lt: 'Kita', color: '#9ca3af' },
};

export const CATEGORY_ORDER: ElementCategory[] = [
  'wall', 'slab', 'column', 'beam', 'roof', 'stair',
  'footing', 'door', 'window', 'fin_wall', 'fin_floor', 'fin_ceiling', 'room', 'other',
];

let counter = 0;
export function uid(): string {
  counter += 1;
  return `qto_${Date.now().toString(36)}_${counter}`;
}
