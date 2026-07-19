// IFC modelio analizė: kiekių (Qto) išgavimas, medžiagos, geometrija, savikontrolės duomenys
import * as WebIFC from 'web-ifc';
import { getIfcApi } from './ifcService';
import { meshStats, emptyStats, mergeStats, transformPoint, type MeshStats } from './geometry';
import { CATEGORY_INFO, uid, type ElementCategory, type QtoItem } from '@/types/qto';
import { round } from '@/lib/format';

export interface ViewerGeometry {
  expressId: number;
  category: ElementCategory;
  positions: Float32Array;
  indices: Uint32Array;
}

export interface IfcParseResult {
  items: QtoItem[];
  geometries: ViewerGeometry[];
  stats: {
    totalElements: number;
    withQuantities: number;
    withoutQuantities: number;
    withoutQuantitiesClasses: string[];
    unitLabel: string;
    unitFactor: number;
    spaceArea_m2?: number;
    triangles: number;
  };
}

type IfcApiT = WebIFC.IfcAPI;

/** Išskleidžia web-ifc reikšmę ({type, value} arba primityvą) */
function V(x: unknown): any {
  if (x && typeof x === 'object' && 'value' in (x as Record<string, unknown>)) {
    return (x as { value: unknown }).value;
  }
  return x;
}

const CLASS_MAP: Array<{ type: number; cls: string; category: ElementCategory }> = [
  { type: WebIFC.IFCWALL, cls: 'IfcWall', category: 'wall' },
  { type: WebIFC.IFCSLAB, cls: 'IfcSlab', category: 'slab' },
  { type: WebIFC.IFCCOLUMN, cls: 'IfcColumn', category: 'column' },
  { type: WebIFC.IFCBEAM, cls: 'IfcBeam', category: 'beam' },
  { type: WebIFC.IFCDOOR, cls: 'IfcDoor', category: 'door' },
  { type: WebIFC.IFCWINDOW, cls: 'IfcWindow', category: 'window' },
  { type: WebIFC.IFCSTAIRFLIGHT, cls: 'IfcStairFlight', category: 'stair' },
  { type: WebIFC.IFCSTAIR, cls: 'IfcStair', category: 'stair' },
  { type: WebIFC.IFCRAMPFLIGHT, cls: 'IfcRampFlight', category: 'stair' },
  { type: WebIFC.IFCROOF, cls: 'IfcRoof', category: 'roof' },
  { type: WebIFC.IFCFOOTING, cls: 'IfcFooting', category: 'footing' },
  { type: WebIFC.IFCPILE, cls: 'IfcPile', category: 'footing' },
  { type: WebIFC.IFCPLATE, cls: 'IfcPlate', category: 'other' },
  { type: WebIFC.IFCMEMBER, cls: 'IfcMember', category: 'other' },
  { type: WebIFC.IFCCOVERING, cls: 'IfcCovering', category: 'other' },
  { type: WebIFC.IFCRAILING, cls: 'IfcRailing', category: 'other' },
  { type: WebIFC.IFCSPACE, cls: 'IfcSpace', category: 'room' },
  { type: WebIFC.IFCBUILDINGELEMENTPROXY, cls: 'IfcBuildingElementProxy', category: 'other' },
];

interface UnitFactors {
  uf: number;      // ilgis -> m
  ufArea: number;  // plotas -> m²
  ufVol: number;   // tūris -> m³
  label: string;
}

function prefixFactor(prefix: unknown): number {
  if (prefix === 'MILLI') return 0.001;
  if (prefix === 'CENTI') return 0.01;
  if (prefix === 'DECI') return 0.1;
  return 1;
}

/** Nustato ilgio, ploto ir tūrio vienetų koeficientus iš IfcUnitAssignment.
 *  SVARBU: IFC Qto reikšmės naudoja atitinkamus vienetus – plotas paprastai jau m²,
 *  tūris m³, net kai ilgis mm. Koeficientai skaičiuojami atskirai. */
function getUnitFactors(api: IfcApiT, modelID: number): UnitFactors {
  const out: UnitFactors = { uf: 1, ufArea: 1, ufVol: 1, label: 'm (numatyta)' };
  try {
    const ids = api.GetLineIDsWithType(modelID, WebIFC.IFCUNITASSIGNMENT);
    for (let i = 0; i < ids.size(); i++) {
      const ua = api.GetLine(modelID, ids.get(i), false);
      for (const uref of ua.Units ?? []) {
        const u = api.GetLine(modelID, V(uref), true);
        if (!u) continue;
        const unitType = V(u?.UnitType);
        const prefix = V(u?.Prefix);
        if (unitType === 'LENGTHUNIT') {
          out.uf = prefixFactor(prefix);
          out.label = prefix === 'MILLI' ? 'mm' : prefix === 'CENTI' ? 'cm' : prefix === 'DECI' ? 'dm' : 'm';
        } else if (unitType === 'AREAUNIT') {
          const f = prefixFactor(prefix);
          out.ufArea = f * f;
        } else if (unitType === 'VOLUMEUNIT') {
          const f = prefixFactor(prefix);
          out.ufVol = f * f * f;
        }
      }
    }
  } catch { /* numatytieji metrai */ }
  return out;
}

/** Surenka ryšius: elementId -> relIds (RelDefinesByProperties / RelAssociatesMaterial) */
function collectRels(api: IfcApiT, modelID: number, relType: number): Map<number, number[]> {
  const out = new Map<number, number[]>();
  try {
    const ids = api.GetLineIDsWithType(modelID, relType);
    for (let i = 0; i < ids.size(); i++) {
      const rel = api.GetLine(modelID, ids.get(i), false);
      for (const r of rel.RelatedObjects ?? []) {
        const id = V(r);
        if (typeof id !== 'number') continue;
        if (!out.has(id)) out.set(id, []);
        out.get(id)!.push(rel.expressID);
      }
    }
  } catch { /* nėra tokio tipo ryšių */ }
  return out;
}

interface QuantSet {
  length?: number; height?: number; width?: number;
  area?: number; volume?: number; count?: number;
  areaName?: string; volumeName?: string;
}

/** Iš IfcElementQuantity / IfcPropertySet rinkinių išima kiekius */
function readQuantities(api: IfcApiT, modelID: number, relIds: number[]): QuantSet {
  const areas: Record<string, number> = {};
  const vols: Record<string, number> = {};
  const set: QuantSet = {};
  for (const relId of relIds) {
    try {
      const rel = api.GetLine(modelID, relId, false);
      const defRef = V(rel.RelatingPropertyDefinition);
      if (typeof defRef !== 'number') continue;
      const def = api.GetLine(modelID, defRef, true);
      const quants = def?.Quantities;
      if (Array.isArray(quants)) {
        for (const q of quants) {
          const name = String(V(q?.Name) ?? '').toLowerCase();
          const lv = V(q?.LengthValue); const av = V(q?.AreaValue);
          const vv = V(q?.VolumeValue); const cv = V(q?.CountValue);
          if (typeof av === 'number') areas[name] = av;
          else if (typeof vv === 'number') vols[name] = vv;
          else if (typeof lv === 'number') {
            if (name.includes('height')) set.height = set.height ?? lv;
            else if (name.includes('width') || name.includes('thickness')) set.width = set.width ?? lv;
            else if (name.includes('length') || name.includes('perimeter')) set.length = set.length ?? lv;
          } else if (typeof cv === 'number') set.count = set.count ?? cv;
        }
      }
    } catch { /* praleidžiame defektinį rinkinį */ }
  }
  const areaPref = ['netsidearea', 'netarea', 'netfloorarea', 'grosssidearea', 'grossarea', 'grossfootprintarea', 'area', 'crosssectionarea', 'outersurfacearea'];
  for (const k of areaPref) if (areas[k] !== undefined) { set.area = areas[k]; set.areaName = k; break; }
  const volPref = ['netvolume', 'grossvolume', 'volume'];
  for (const k of volPref) if (vols[k] !== undefined) { set.volume = vols[k]; set.volumeName = k; break; }
  return set;
}

/** Iš IfcRelAssociatesMaterial išskaito medžiagos pavadinimą */
function readMaterial(api: IfcApiT, modelID: number, relIds: number[]): string | undefined {
  for (const relId of relIds) {
    try {
      const rel = api.GetLine(modelID, relId, false);
      const matRef = V(rel.RelatingMaterial);
      if (typeof matRef !== 'number') continue;
      const mat = api.GetLine(modelID, matRef, true);
      if (!mat) continue;
      const direct = V(mat.Name);
      if (typeof direct === 'string' && direct) return direct;
      const layers = mat.MaterialLayers ?? mat.ForLayerSet?.MaterialLayers;
      if (Array.isArray(layers) && layers.length) {
        const names = layers.map((l: unknown) => V((l as Record<string, unknown>).Material && (l as any).Material.Name)).filter(Boolean);
        if (names.length) return names.join(' + ');
      }
      const mats = mat.Materials ?? mat.MaterialConstituents;
      if (Array.isArray(mats) && mats.length) {
        const names = mats.map((m: unknown) => V((m as Record<string, unknown>).Name)).filter(Boolean);
        if (names.length) return names.join(' + ');
      }
    } catch { /* praleidžiame */ }
  }
  return undefined;
}

function pickUnit(category: ElementCategory, hasVol: boolean, hasArea: boolean): QtoItem['unit'] {
  if (category === 'door' || category === 'window' || category === 'stair' || category === 'column') return 'vnt.';
  if (hasVol) return 'm³';
  if (hasArea) return 'm²';
  return 'vnt.';
}

export async function parseIfcFile(
  buffer: ArrayBuffer,
  onProgress?: (pct: number, label: string) => void,
): Promise<IfcParseResult> {
  const api = await getIfcApi();
  onProgress?.(5, 'Atidaromas IFC modelis…');
  const modelID = api.OpenModel(new Uint8Array(buffer));
  const { uf, ufArea, ufVol, label: unitLabel } = getUnitFactors(api, modelID);

  onProgress?.(10, 'Skaitomos savybės ir medžiagos…');
  const relQto = collectRels(api, modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
  const relMat = collectRels(api, modelID, WebIFC.IFCRELASSOCIATESMATERIAL);

  // Geometrija: perleidžiame visus reikalingų tipų tinklelius
  onProgress?.(20, 'Skaičiuojama geometrija (gali užtrukti)…');
  const geoById = new Map<number, MeshStats>();
  const viewerGeos: ViewerGeometry[] = [];
  const catById = new Map<number, ElementCategory>();
  let totalTriangles = 0;

  const elementIdsByClass: Array<{ ids: number[]; cls: string; category: ElementCategory }> = [];
  for (const m of CLASS_MAP) {
    try {
      const vec = api.GetLineIDsWithType(modelID, m.type, true);
      const ids: number[] = [];
      for (let i = 0; i < vec.size(); i++) {
        const id = vec.get(i);
        ids.push(id);
        catById.set(id, m.category);
      }
      if (ids.length) elementIdsByClass.push({ ids, cls: m.cls, category: m.category });
    } catch { /* tipo modelyje nėra */ }
  }

  // Srautiniu būdu perleidžiame VISUS tinklelius ir filtruojame pagal surinktus id
  // (būtina StreamAllMeshes – konkrečios klases, pvz. IfcWallStandardCase, paveldi bazinę)
  let streamed = 0;
  const allIds = new Set(catById.keys());
  api.StreamAllMeshes(modelID, (mesh) => {
    streamed++;
    const id = mesh.expressID;
    if (!allIds.has(id)) return;
    const category = catById.get(id)!;
    let acc = geoById.get(id);
    if (!acc) { acc = emptyStats(); geoById.set(id, acc); }
    for (let g = 0; g < mesh.geometries.size(); g++) {
      const placed = mesh.geometries.get(g);
      try {
        const geom = api.GetGeometry(modelID, placed.geometryExpressID);
        const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const idx = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        // Pritaikius transformaciją koordinatės jau METRAIS (web-ifc konvertuoja pats)
        const st = meshStats(verts, idx, placed.flatTransformation);
        mergeStats(acc, st);
        totalTriangles += st.triangles;
        // Vaizdui: transformuoti viršūnes, tik pozicijos (be normalių; ribojame ~600k trikampių)
        if (totalTriangles < 600_000) {
          const nVerts = Math.floor(verts.length / 6);
          const pos = new Float32Array(nVerts * 3);
          for (let i = 0, j = 0; i + 2 < verts.length; i += 6, j += 3) {
            const [x, y, z] = transformPoint(placed.flatTransformation, verts[i], verts[i + 1], verts[i + 2]);
            pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
          }
          viewerGeos.push({ expressId: id, category, positions: pos, indices: idx });
        }
      } catch { /* praleidžiame defektinę geometriją */ }
    }
    if (streamed % 200 === 0) onProgress?.(20 + Math.min(50, streamed / 40), 'Skaičiuojama geometrija…');
  });

  onProgress?.(75, 'Formuojami kiekiai…');
  const items: QtoItem[] = [];
  let withQ = 0;
  const noQClasses = new Set<string>();
  let totalElements = 0;
  let spaceArea = 0;

  for (const { ids, cls, category } of elementIdsByClass) {
    for (const id of ids) {
      totalElements++;
      let name = `${cls} #${id}`;
      try {
        const line = api.GetLine(modelID, id, true);
        const n = V(line?.Name);
        if (typeof n === 'string' && n) name = n;
        const tag = V(line?.Tag);
        if (typeof tag === 'string' && tag && !name.includes(tag)) name = `${name} [${tag}]`;
      } catch { /* lieka numatytasis pavadinimas */ }

      const q = readQuantities(api, modelID, relQto.get(id) ?? []);
      const material = readMaterial(api, modelID, relMat.get(id) ?? []);
      const geo = geoById.get(id);

      const length_m = q.length !== undefined ? round(q.length * uf, 3) : undefined;
      const height_m = q.height !== undefined ? round(q.height * uf, 3) : undefined;
      const thickness_m = q.width !== undefined ? round(q.width * uf, 3) : undefined;
      const area_m2 = q.area !== undefined ? round(q.area * ufArea, 3) : undefined;
      const volume_m3 = q.volume !== undefined ? round(q.volume * ufVol, 3) : undefined;

      // Geometrija jau METRAIS (web-ifc konvertuoja); aukštis – Y ašis (Y-up)
      const geoLen = geo ? round(Math.max(geo.maxX - geo.minX, geo.maxZ - geo.minZ), 3) : undefined;
      const geoHeight = geo ? round(geo.maxY - geo.minY, 3) : undefined;
      const geoWidth = geo ? round(Math.min(geo.maxX - geo.minX, geo.maxZ - geo.minZ), 3) : undefined;
      const geoArea = geo ? round(geo.area_m2, 3) : undefined;
      const geoVol = geo ? round(geo.volume_m3, 3) : undefined;

      if (category === 'room' && area_m2) spaceArea += area_m2;

      const hasQ = area_m2 !== undefined || volume_m3 !== undefined || length_m !== undefined;
      if (hasQ) withQ++; else noQClasses.add(cls);

      const notes: string[] = [];
      if (category === 'wall' && q.areaName === 'netsidearea') notes.push('Angos atimtos (NetSideArea)');
      if (!hasQ && geo) notes.push('Kiekiai iš geometrijos (angų atėmimas nežinomas)');
      if (!hasQ && !geo) notes.push('Nėra nei Qto, nei geometrijos – tik vnt.');

      const unit = pickUnit(category, volume_m3 !== undefined || geoVol !== undefined, area_m2 !== undefined || geoArea !== undefined);

      items.push({
        id: uid(),
        source: 'IFC',
        category,
        ifcClass: cls,
        name,
        material,
        length_m: length_m ?? geoLen,
        width_m: thickness_m ?? geoWidth,
        height_m: height_m ?? geoHeight,
        thickness_m,
        area_m2: area_m2 ?? (unit === 'm²' ? geoArea : undefined),
        volume_m3: volume_m3 ?? (unit === 'm³' ? geoVol : undefined),
        count: 1,
        unit,
        origin: hasQ ? 'project' : 'ai',
        declaredVolume_m3: volume_m3,
        meshVolume_m3: geoVol,
        note: notes.length ? notes.join('; ') : undefined,
      });
    }
  }

  try { api.CloseModel(modelID); } catch { /* modelis jau uždarytas */ }
  onProgress?.(100, 'Baigta');

  return {
    items,
    geometries: viewerGeos,
    stats: {
      totalElements,
      withQuantities: withQ,
      withoutQuantities: totalElements - withQ,
      withoutQuantitiesClasses: [...noQClasses],
      unitLabel,
      unitFactor: uf,
      spaceArea_m2: spaceArea > 0 ? round(spaceArea, 2) : undefined,
      triangles: totalTriangles,
    },
  };
}

export { CATEGORY_INFO };
