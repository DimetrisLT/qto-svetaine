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
  | 'other';

export type MeasureUnit = 'vnt.' | 'm' | 'm²' | 'm³';

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
  /** IFC deklaruotas tūris iš Qto rinkinių (savikontrolei) */
  declaredVolume_m3?: number;
  /** Tūris, apskaičiuotas iš geometrinio modelio (savikontrolei) */
  meshVolume_m3?: number;
  /** PDF matavimo duomenys (figūrų atvaizdavimui ant brėžinio) */
  pdfKind?: 'length' | 'area' | 'count';
  pdfPoints?: Array<{ x: number; y: number }>;
  pdfPage?: number;
  note?: string;
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
  other: { lt: 'Kita', color: '#9ca3af' },
};

export const CATEGORY_ORDER: ElementCategory[] = [
  'wall', 'slab', 'column', 'beam', 'roof', 'stair',
  'footing', 'door', 'window', 'room', 'other',
];

let counter = 0;
export function uid(): string {
  counter += 1;
  return `qto_${Date.now().toString(36)}_${counter}`;
}
