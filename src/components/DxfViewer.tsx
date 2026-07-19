import { useMemo, useState } from 'react';
import { Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { CATEGORY_INFO, CATEGORY_ORDER, uid, type ElementCategory, type QtoItem } from '@/types/qto';
import type { DxfParseResult, LayerStats } from '@/lib/dxf/parseDxf';
import { fmt, round } from '@/lib/format';

interface Props {
  data: DxfParseResult;
  items: QtoItem[];
  onChange: (items: QtoItem[], meta: { unassignedLayers: string[]; dxfUnitFactor: number }) => void;
}

const UNIT_OPTIONS = [
  { label: 'mm', factor: 0.001 },
  { label: 'cm', factor: 0.01 },
  { label: 'm', factor: 1 },
];

interface LayerDraft {
  category: ElementCategory;
  height: string;
  thickness: string;
  material: string;
  name: string;
}

/** DXF sluoksnių analizė: geometrija + priskyrimas elementų kategorijoms */
export default function DxfViewer({ data, items, onChange }: Props) {
  const [unitIdx, setUnitIdx] = useState(0); // mm pagal nutylėjimą
  const [zoomK, setZoomK] = useState(1);
  const [drafts, setDrafts] = useState<Record<string, LayerDraft>>({});
  const uf = UNIT_OPTIONS[unitIdx].factor;

  const { minX, minY, maxX, maxY } = data.bounds;
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const pad = Math.max(w, h) * 0.03;
  const vb = useMemo(() => {
    const zw = (w + pad * 2) / zoomK;
    const zh = (h + pad * 2) / zoomK;
    const cx = minX - pad + (w + pad * 2) / 2;
    const cy = minY - pad + (h + pad * 2) / 2;
    return `${cx - zw / 2} ${cy - zh / 2} ${zw} ${zh}`;
  }, [minX, minY, w, h, pad, zoomK]);

  const usedLayers = useMemo(() => new Set(items.map((i) => i.name.match(/\[sluoksnis: (.+)\]$/)?.[1]).filter(Boolean)), [items]);

  const unassigned = useMemo(() => {
    return data.layers
      .filter((l) => (l.lengthUnits > 0 || l.insertCount > 0 || l.closedAreaUnits2 > 0) && !usedLayers.has(l.name))
      .map((l) => l.name);
  }, [data.layers, usedLayers]);

  const emit = (next: QtoItem[]) => {
    // Skaičiuojama iš NAUJŲ elementų (ne iš pasenusio memo), kad meta būtų tiksli
    const used = new Set(next.map((i) => i.name.match(/\[sluoksnis: (.+)\]$/)?.[1]).filter(Boolean));
    const un = data.layers
      .filter((l) => (l.lengthUnits > 0 || l.insertCount > 0 || l.closedAreaUnits2 > 0) && !used.has(l.name))
      .map((l) => l.name);
    onChange(next, { unassignedLayers: un, dxfUnitFactor: uf });
  };

  const draftOf = (l: LayerStats): LayerDraft => drafts[l.name] ?? {
    category: 'wall',
    height: '3',
    thickness: '',
    material: '',
    name: `${CATEGORY_INFO.wall.lt} [sluoksnis: ${l.name}]`,
  };

  const setDraft = (name: string, d: LayerDraft) => setDrafts((s) => ({ ...s, [name]: d }));

  const addLayer = (l: LayerStats) => {
    const d = draftOf(l);
    const h = parseFloat(d.height.replace(',', '.'));
    const t = parseFloat(d.thickness.replace(',', '.'));
    const lenM = round(l.lengthUnits * uf, 3);
    const areaM2 = round(l.closedAreaUnits2 * uf * uf, 3);

    let length_m: number | undefined;
    let area_m2: number | undefined;
    let volume_m3: number | undefined;
    let count = 1;
    let unit: QtoItem['unit'] = 'm';
    const notes: string[] = [];

    if (d.category === 'wall' || d.category === 'beam' || d.category === 'other') {
      length_m = lenM;
      if (!Number.isNaN(h) && h > 0) {
        area_m2 = round(lenM * h, 3);
        unit = 'm²';
        if (!Number.isNaN(t) && t > 0) { volume_m3 = round(area_m2 * t, 3); unit = 'm³'; }
      } else {
        notes.push('Nenurodytas aukštis – tik ilgis');
      }
    } else if (d.category === 'slab' || d.category === 'roof' || d.category === 'footing' || d.category === 'room') {
      if (areaM2 > 0) {
        area_m2 = areaM2;
        unit = 'm²';
        if (!Number.isNaN(t) && t > 0) { volume_m3 = round(areaM2 * t, 3); unit = 'm³'; }
      } else {
        length_m = lenM;
        notes.push('Uždarų kontūrų nerasta – paimtas linijų ilgis');
        unit = 'm';
      }
    } else {
      // Kolonos, durys, langai, laiptai – pagal blokų įterpimus
      if (l.insertCount > 0) {
        count = l.insertCount;
        unit = 'vnt.';
        const blokai = Object.entries(l.blocks).map(([k, v]) => `${k}×${v}`).join(', ');
        notes.push(`Blokai: ${blokai}`);
      } else {
        count = 0;
        notes.push('Sluoksnyje blokų nerasta – patikrinkite priskyrimą');
      }
    }

    const item: QtoItem = {
      id: uid(),
      source: 'DXF',
      category: d.category,
      name: d.name.includes('[sluoksnis:') ? d.name : `${d.name} [sluoksnis: ${l.name}]`,
      material: d.material || undefined,
      length_m,
      height_m: !Number.isNaN(h) && h > 0 && (d.category === 'wall' || d.category === 'beam') ? h : undefined,
      thickness_m: !Number.isNaN(t) && t > 0 ? t : undefined,
      area_m2,
      volume_m3,
      count,
      unit,
      note: notes.length ? notes.join('; ') : undefined,
    };
    emit([...items, item]);
  };

  const removeByLayer = (layerName: string) => {
    emit(items.filter((i) => !i.name.endsWith(`[sluoksnis: ${layerName}]`)));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">
            Brėžinio vienetai:
            <select
              value={unitIdx}
              onChange={(e) => setUnitIdx(Number(e.target.value))}
              className="ml-1.5 h-8 rounded-md border bg-background px-2 text-xs"
            >
              {UNIT_OPTIONS.map((u, i) => <option key={u.label} value={i}>{u.label}</option>)}
            </select>
          </label>
          <button onClick={() => setZoomK((z) => Math.max(0.5, z / 1.4))} className="rounded-lg border p-1.5 hover:bg-muted"><ZoomOut className="h-3.5 w-3.5" /></button>
          <button onClick={() => setZoomK((z) => Math.min(50, z * 1.4))} className="rounded-lg border p-1.5 hover:bg-muted"><ZoomIn className="h-3.5 w-3.5" /></button>
          <span className="text-xs text-muted-foreground">
            Objektų: {data.totalEntities}{data.skippedEntities > 0 ? ` (praleista: ${data.skippedEntities})` : ''}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white dark:bg-slate-950">
          <svg viewBox={vb} className="h-[520px] w-full" style={{ background: 'inherit' }}>
            <g transform={`scale(1,-1) translate(0, ${-(minY - pad + maxY + pad)})`}>
              {data.shapes.map((s, idx) => {
                const layer = data.layers.find((l) => l.name === s.layer);
                const color = layer?.color ?? '#475569';
                const strokeW = Math.max(w, h) / 400;
                if (s.kind === 'line' && s.points.length >= 2) {
                  return <line key={idx} x1={s.points[0].x} y1={s.points[0].y} x2={s.points[1].x} y2={s.points[1].y} stroke={color} strokeWidth={strokeW} />;
                }
                if (s.kind === 'polyline') {
                  const pts = s.points.map((p) => `${p.x},${p.y}`).join(' ');
                  return s.closed
                    ? <polygon key={idx} points={pts} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={strokeW} />
                    : <polyline key={idx} points={pts} fill="none" stroke={color} strokeWidth={strokeW} />;
                }
                if (s.kind === 'circle' && s.center && s.radius) {
                  return <circle key={idx} cx={s.center.x} cy={s.center.y} r={s.radius} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={strokeW} />;
                }
                if (s.kind === 'arc' && s.center && s.radius && s.startAngle !== undefined && s.endAngle !== undefined) {
                  const x0 = s.center.x + s.radius * Math.cos(s.startAngle);
                  const y0 = s.center.y + s.radius * Math.sin(s.startAngle);
                  const x1 = s.center.x + s.radius * Math.cos(s.endAngle);
                  const y1 = s.center.y + s.radius * Math.sin(s.endAngle);
                  const large = s.endAngle - s.startAngle > Math.PI ? 1 : 0;
                  return <path key={idx} d={`M ${x0} ${y0} A ${s.radius} ${s.radius} 0 ${large} 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={strokeW} />;
                }
                return null;
              })}
            </g>
          </svg>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Spalvos – pagal DXF sluoksnių spalvas. Anotacijos (tekstai, matmenys) kiekiams nenaudojami.
        </p>
      </div>

      {/* Sluoksnių priskyrimas */}
      <div className="space-y-2 max-h-[640px] overflow-auto pr-1">
        <p className="text-sm font-semibold">Sluoksniai ({data.layers.length})</p>
        {unassigned.length > 0 && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ Nepriskirta sluoksnių: {unassigned.length}
          </p>
        )}
        {data.layers.map((l) => {
          const used = usedLayers.has(l.name);
          const d = draftOf(l);
          const empty = l.lengthUnits === 0 && l.insertCount === 0 && l.closedAreaUnits2 === 0;
          return (
            <div key={l.name} className={`rounded-xl border p-2.5 text-xs ${used ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30' : ''}`}>
              <div className="mb-1 flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: l.color }} />
                <span className="font-semibold">{l.name}</span>
                <span className="ml-auto text-muted-foreground">
                  {empty ? 'tuščias / anotacijos' : `${fmt(l.lengthUnits * uf)} m · ${fmt(l.closedAreaUnits2 * uf * uf)} m² · ${l.insertCount} blok.`}
                </span>
              </div>
              {!empty && !used && (
                <div className="space-y-1.5">
                  <div className="flex gap-1.5">
                    <select
                      value={d.category}
                      onChange={(e) => {
                        const cat = e.target.value as ElementCategory;
                        setDraft(l.name, { ...d, category: cat, name: `${CATEGORY_INFO[cat].lt} [sluoksnis: ${l.name}]` });
                      }}
                      className="h-8 w-full rounded-md border bg-background px-1.5"
                    >
                      {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_INFO[c].lt}</option>)}
                    </select>
                    <input
                      value={d.material}
                      onChange={(e) => setDraft(l.name, { ...d, material: e.target.value })}
                      placeholder="Medžiaga"
                      className="h-8 w-full rounded-md border bg-background px-1.5"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={d.height}
                      onChange={(e) => setDraft(l.name, { ...d, height: e.target.value })}
                      placeholder="Aukštis m"
                      inputMode="decimal"
                      title="Aukštis (sienoms/sijoms)"
                      className="h-8 w-full rounded-md border bg-background px-1.5"
                    />
                    <input
                      value={d.thickness}
                      onChange={(e) => setDraft(l.name, { ...d, thickness: e.target.value })}
                      placeholder="Storis m"
                      inputMode="decimal"
                      title="Storis (tūriui)"
                      className="h-8 w-full rounded-md border bg-background px-1.5"
                    />
                    <button
                      onClick={() => addLayer(l)}
                      className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 font-medium text-primary-foreground"
                    >
                      <Plus className="h-3.5 w-3.5" /> Įtraukti
                    </button>
                  </div>
                </div>
              )}
              {used && (
                <div className="flex items-center justify-between">
                  <span className="text-emerald-600">✓ Įtraukta į kiekius</span>
                  <button onClick={() => removeByLayer(l.name)} className="flex items-center gap-1 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" /> Šalinti
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
