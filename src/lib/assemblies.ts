// Kompozitiniai darbai (assemblies): vienas matavimas → kelios žiniaraščio eilutės
// Taisyklės deterministinės ir permatomos – kiekviena išvestinė eilutė rodo formulę.
// Kofano taisyklės: kontaktinio paviršiaus plotas (angos iki 0,3 m² neatimamos).
// Armatūra: kg/m³ įvertis pagal elemento tipą (tipiniai diapazonai: sijos 150–300,
// kolonos 200–450, perdangos ~80–120, sienos ~100–200, pamatai ~60–100 kg/m³).
import { uid, type ElementCategory, type QtoItem } from '@/types/qto';
import { fmt } from '@/lib/format';

export interface AssemblyParam {
  key: string;
  label: string;
  unit: string;
  def: number;
  min?: number;
  max?: number;
  step?: number;
}

export interface DerivedLine {
  name: string;
  unit: QtoItem['unit'];
  qty: number;
  category: ElementCategory;
  formula: string;
  field?: 'volume_m3' | 'area_m2' | 'mass_kg';
  material?: string;
}

export interface AssemblyTemplate {
  id: string;
  name: string;
  desc: string;
  requires: 'length' | 'area';
  params: AssemblyParam[];
  derive: (base: number, p: Record<string, number>) => DerivedLine[];
}

const P = (key: string, label: string, unit: string, def: number, step = 0.05): AssemblyParam => ({
  key, label, unit, def, step,
});

export const ASSEMBLY_TEMPLATES: AssemblyTemplate[] = [
  {
    id: 'wall_len',
    name: 'Monolitinė siena (iš ilgio)',
    desc: 'Išmatuotas sienos ilgis plane → betonas, kofanas (2 šonai), armatūra, tinkas.',
    requires: 'length',
    params: [P('h', 'Sienos aukštis', 'm', 3.0), P('d', 'Storis', 'm', 0.25), P('r', 'Armatūra', 'kg/m³', 150, 10)],
    derive: (L, p) => {
      const V = L * p.h * p.d;
      return [
        { name: 'Betonas', unit: 'm³', qty: V, category: 'wall', field: 'volume_m3', material: 'Betonas', formula: `V = ${fmt(L)} × ${fmt(p.h)} × ${fmt(p.d)} = ${fmt(V)} m³` },
        { name: 'Kofanas', unit: 'm²', qty: 2 * L * p.h, category: 'wall', field: 'area_m2', formula: `F = 2 × ${fmt(L)} × ${fmt(p.h)} = ${fmt(2 * L * p.h)} m² (angos ≤0,3 m² neatimamos)` },
        { name: 'Armatūra (įvertis)', unit: 'kg', qty: V * p.r, category: 'wall', field: 'mass_kg', material: 'Armatūra', formula: `A = ${fmt(V)} m³ × ${fmt(p.r)} kg/m³ = ${fmt(V * p.r)} kg` },
        { name: 'Tinkas / sienų apdaila', unit: 'm²', qty: 2 * L * p.h, category: 'fin_wall', field: 'area_m2', formula: `A = 2 × ${fmt(L)} × ${fmt(p.h)} = ${fmt(2 * L * p.h)} m²` },
      ];
    },
  },
  {
    id: 'wall_area',
    name: 'Monolitinė siena (iš ploto)',
    desc: 'Išmatuotas sienos plotas (fasadas/pjūvis) → betonas, kofanas, armatūra, tinkas.',
    requires: 'area',
    params: [P('d', 'Storis', 'm', 0.25), P('r', 'Armatūra', 'kg/m³', 150, 10)],
    derive: (A, p) => {
      const V = A * p.d;
      return [
        { name: 'Betonas', unit: 'm³', qty: V, category: 'wall', field: 'volume_m3', material: 'Betonas', formula: `V = ${fmt(A)} × ${fmt(p.d)} = ${fmt(V)} m³` },
        { name: 'Kofanas', unit: 'm²', qty: 2 * A, category: 'wall', field: 'area_m2', formula: `F = 2 × ${fmt(A)} = ${fmt(2 * A)} m²` },
        { name: 'Armatūra (įvertis)', unit: 'kg', qty: V * p.r, category: 'wall', field: 'mass_kg', material: 'Armatūra', formula: `A = ${fmt(V)} m³ × ${fmt(p.r)} kg/m³ = ${fmt(V * p.r)} kg` },
        { name: 'Tinkas / sienų apdaila', unit: 'm²', qty: 2 * A, category: 'fin_wall', field: 'area_m2', formula: `A = 2 × ${fmt(A)} = ${fmt(2 * A)} m²` },
      ];
    },
  },
  {
    id: 'slab',
    name: 'Monolitinė perdanga (iš ploto)',
    desc: 'Išmatuotas perdangos plotas → betonas, kofano dugnas, armatūra, lubų apdaila.',
    requires: 'area',
    params: [P('d', 'Storis', 'm', 0.2), P('r', 'Armatūra', 'kg/m³', 100, 10)],
    derive: (A, p) => {
      const V = A * p.d;
      return [
        { name: 'Betonas', unit: 'm³', qty: V, category: 'slab', field: 'volume_m3', material: 'Betonas', formula: `V = ${fmt(A)} × ${fmt(p.d)} = ${fmt(V)} m³` },
        { name: 'Kofanas (dugnas)', unit: 'm²', qty: A, category: 'slab', field: 'area_m2', formula: `F = ${fmt(A)} m²` },
        { name: 'Armatūra (įvertis)', unit: 'kg', qty: V * p.r, category: 'slab', field: 'mass_kg', material: 'Armatūra', formula: `A = ${fmt(V)} m³ × ${fmt(p.r)} kg/m³ = ${fmt(V * p.r)} kg` },
        { name: 'Lubų apdaila', unit: 'm²', qty: A, category: 'fin_ceiling', field: 'area_m2', formula: `A = ${fmt(A)} m²` },
      ];
    },
  },
  {
    id: 'column',
    name: 'Monolitinė kolona (iš aukščio)',
    desc: 'Išmatuotas kolonos aukštis → betonas, kofanas (perimetras), armatūra.',
    requires: 'length',
    params: [P('a', 'Pjūvio a', 'm', 0.4), P('b', 'Pjūvio b', 'm', 0.4), P('r', 'Armatūra', 'kg/m³', 250, 10)],
    derive: (L, p) => {
      const V = p.a * p.b * L;
      return [
        { name: 'Betonas', unit: 'm³', qty: V, category: 'column', field: 'volume_m3', material: 'Betonas', formula: `V = ${fmt(p.a)} × ${fmt(p.b)} × ${fmt(L)} = ${fmt(V)} m³` },
        { name: 'Kofanas', unit: 'm²', qty: 2 * (p.a + p.b) * L, category: 'column', field: 'area_m2', formula: `F = 2 × (${fmt(p.a)} + ${fmt(p.b)}) × ${fmt(L)} = ${fmt(2 * (p.a + p.b) * L)} m²` },
        { name: 'Armatūra (įvertis)', unit: 'kg', qty: V * p.r, category: 'column', field: 'mass_kg', material: 'Armatūra', formula: `A = ${fmt(V)} m³ × ${fmt(p.r)} kg/m³ = ${fmt(V * p.r)} kg` },
      ];
    },
  },
  {
    id: 'beam',
    name: 'Monolitinė sija (iš ilgio)',
    desc: 'Išmatuotas sijos ilgis → betonas, kofanas (dugnas + 2 šonai), armatūra.',
    requires: 'length',
    params: [P('b', 'Plotis b', 'm', 0.3), P('h', 'Aukštis h', 'm', 0.5), P('r', 'Armatūra', 'kg/m³', 200, 10)],
    derive: (L, p) => {
      const V = p.b * p.h * L;
      return [
        { name: 'Betonas', unit: 'm³', qty: V, category: 'beam', field: 'volume_m3', material: 'Betonas', formula: `V = ${fmt(p.b)} × ${fmt(p.h)} × ${fmt(L)} = ${fmt(V)} m³` },
        { name: 'Kofanas', unit: 'm²', qty: (p.b + 2 * p.h) * L, category: 'beam', field: 'area_m2', formula: `F = (${fmt(p.b)} + 2 × ${fmt(p.h)}) × ${fmt(L)} = ${fmt((p.b + 2 * p.h) * L)} m²` },
        { name: 'Armatūra (įvertis)', unit: 'kg', qty: V * p.r, category: 'beam', field: 'mass_kg', material: 'Armatūra', formula: `A = ${fmt(V)} m³ × ${fmt(p.r)} kg/m³ = ${fmt(V * p.r)} kg` },
      ];
    },
  },
  {
    id: 'footing',
    name: 'Monolitiniai pamatai (iš ploto)',
    desc: 'Išmatuotas pamatų plotas plane → betonas, armatūra.',
    requires: 'area',
    params: [P('d', 'Storis', 'm', 0.5), P('r', 'Armatūra', 'kg/m³', 80, 10)],
    derive: (A, p) => {
      const V = A * p.d;
      return [
        { name: 'Betonas', unit: 'm³', qty: V, category: 'footing', field: 'volume_m3', material: 'Betonas', formula: `V = ${fmt(A)} × ${fmt(p.d)} = ${fmt(V)} m³` },
        { name: 'Armatūra (įvertis)', unit: 'kg', qty: V * p.r, category: 'footing', field: 'mass_kg', material: 'Armatūra', formula: `A = ${fmt(V)} m³ × ${fmt(p.r)} kg/m³ = ${fmt(V * p.r)} kg` },
      ];
    },
  },
];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Ar šablonas pritaikomas elementui (turi reikiamą matmenį) */
export function canApply(t: AssemblyTemplate, item: QtoItem): boolean {
  return t.requires === 'length' ? (item.length_m ?? 0) > 0 : (item.area_m2 ?? 0) > 0;
}

/** Sugeneruoja išvestines žiniaraščio eilutes iš šaltinio matavimo */
export function applyAssembly(t: AssemblyTemplate, item: QtoItem, params: Record<string, number>): QtoItem[] {
  const base = t.requires === 'length' ? item.length_m! : item.area_m2!;
  return t
    .derive(base, params)
    .filter((l) => l.qty > 0)
    .map((l) => {
      const qty = round3(l.qty);
      return {
        id: uid(),
        source: item.source,
        category: l.category,
        name: `${l.name} („${item.name}“)`,
        count: qty,
        unit: l.unit,
        origin: 'ai' as const,
        ...(l.field ? { [l.field]: qty } : {}),
        ...(l.material ? { material: l.material } : {}),
        ...(item.pdfFile ? { pdfFile: item.pdfFile } : {}),
        ...(item.pdfPage ? { pdfPage: item.pdfPage } : {}),
        ...(item.discipline ? { discipline: item.discipline } : {}),
        note: `Išvestinė eilutė (${t.name}): ${l.formula}`,
      };
    });
}
