// Patalpų apdailos žiniaraščio generavimas iš patalpos poligono:
// grindys + lubos (= plotas), sienų apdaila (= perimetras × aukštis − angos).
import { pointInPolygon } from '@/lib/geometry2d';
import { round } from '@/lib/format';
import { uid, type QtoItem } from '@/types/qto';

export interface RoomFinishOptions {
  /** Patalpos aukštis, m */
  heightM: number;
  /** Ar atimti durų/langų angas iš sienų apdailos */
  deductOpenings: boolean;
  /** Atimamos tik angos, kurių vieneto plotas ≥ šios ribos (m²) – klasikinė 0,5 m² taisyklė */
  openingThresholdM2: number;
}

export const DEFAULT_ROOM_FINISH_OPTS: RoomFinishOptions = {
  heightM: 2.7,
  deductOpenings: true,
  openingThresholdM2: 0.5,
};

// Numatytieji angų plotai, kai durys/langai pažymėti tik skaičiavimu be ploto
const DEFAULT_OPENING_AREA: Record<string, number> = {
  door: 0.9 * 2.1,   // 1,89 m²
  window: 1.5 * 1.5, // 2,25 m²
};

export interface OpeningsInfo {
  areaM2: number;
  count: number;
  /** Kiek angų praleista dėl <0,5 m² ribos */
  skipped: number;
}

/** Durų/langų pozicijos patalpos viduje (pagal PDF taškus) ir jų atimamas plotas */
export function openingsInRoom(
  room: QtoItem,
  allItems: QtoItem[],
  thresholdM2 = 0.5,
): OpeningsInfo {
  const poly = room.pdfPoints ?? [];
  if (poly.length < 3) return { areaM2: 0, count: 0, skipped: 0 };
  let areaM2 = 0, count = 0, skipped = 0;
  for (const it of allItems) {
    if (it.id === room.id) continue;
    if (it.category !== 'door' && it.category !== 'window') continue;
    if (it.pdfPage !== room.pdfPage || it.pdfFile !== room.pdfFile) continue;
    const pts = it.pdfPoints ?? [];
    const inside = pts.some((p) => pointInPolygon(p, poly));
    if (!inside) continue;
    const n = Math.max(1, it.count ?? 1);
    // Vieneto plotas: žinomas (iš formos) arba tipinis
    const perOpening = it.area_m2 && n > 0
      ? it.area_m2 / n
      : DEFAULT_OPENING_AREA[it.category] ?? 1.5;
    if (perOpening >= thresholdM2) {
      areaM2 += perOpening * n;
      count += n;
    } else {
      skipped += n;
    }
  }
  return { areaM2: round(areaM2, 3), count, skipped };
}

/**
 * Sugeneruoja 3 apdailos pozicijas patalpai: grindis, lubas, sienų apdailą.
 * Patalpos item turi turėti area_m2 ir length_m (perimetras – įrašomas matavimo metu).
 */
export function buildRoomFinishItems(
  room: QtoItem,
  allItems: QtoItem[],
  opts: RoomFinishOptions = DEFAULT_ROOM_FINISH_OPTS,
): QtoItem[] {
  const area = room.area_m2 ?? 0;
  const perim = room.length_m ?? 0;
  if (area <= 0 || perim <= 0 || opts.heightM <= 0) return [];

  const name = room.name || 'Patalpa';
  const base = {
    source: room.source,
    pdfKind: 'area' as const,
    pdfPoints: room.pdfPoints,
    pdfPage: room.pdfPage,
    pdfFile: room.pdfFile,
    discipline: room.discipline,
    origin: 'ai' as const,
    count: 1,
  };

  let wallArea = round(perim * opts.heightM, 3);
  let wallNote = `Perimetras ${round(perim, 2)} m × aukštis ${opts.heightM} m`;
  if (opts.deductOpenings) {
    const op = openingsInRoom(room, allItems, opts.openingThresholdM2);
    if (op.areaM2 > 0) {
      wallArea = round(Math.max(0, wallArea - op.areaM2), 3);
      wallNote += ` − angos ${op.areaM2} m² (${op.count} vnt.)`;
    }
    if (op.skipped > 0) wallNote += `; praleista ${op.skipped} angų <${opts.openingThresholdM2} m²`;
  }

  const mk = (category: QtoItem['category'], suffix: string, areaM2: number, note?: string): QtoItem => ({
    id: uid(),
    ...base,
    category,
    name: `${name} – ${suffix}`,
    area_m2: areaM2,
    unit: 'm²',
    note,
  });

  return [
    mk('fin_floor', 'grindų apdaila', round(area, 3), `Patalpos plotas ${round(area, 3)} m²`),
    mk('fin_ceiling', 'lubų apdaila', round(area, 3), `Patalpos plotas ${round(area, 3)} m²`),
    mk('fin_wall', 'sienų apdaila', wallArea, wallNote),
  ];
}
