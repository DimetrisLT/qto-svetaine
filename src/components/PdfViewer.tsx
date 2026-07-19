import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Ruler, Spline, Pentagon, Hash, Trash2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
import { CATEGORY_INFO, CATEGORY_ORDER, uid, type ElementCategory, type QtoItem } from '@/types/qto';
import { dist, polygonArea, polylineLength, type Pt } from '@/lib/pdf/measure';
import { fmt, round } from '@/lib/format';
import { cn } from '@/lib/utils';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type Tool = 'none' | 'calib' | 'length' | 'area' | 'count';

interface PendingForm {
  kind: 'length' | 'area' | 'count';
  pts: Pt[];
  category: ElementCategory;
  name: string;
  height: string;
  thickness: string;
  perArea: string;
  perVolume: string;
  material: string;
}

interface Props {
  fileId: string;
  file: File;
  discipline: string;
  unitsPerMeter: number | null;
  onCalibrate: (upm: number | null) => void;
  items: QtoItem[];
  onItemsChange: (items: QtoItem[]) => void;
}

export default function PdfViewer({ fileId, file, discipline, unitsPerMeter, onCalibrate, items, onItemsChange }: Props) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [zoom, setZoom] = useState(1.6);
  const [tool, setTool] = useState<Tool>('none');
  const [current, setCurrent] = useState<Pt[]>([]);
  const [calibPts, setCalibPts] = useState<Pt[]>([]);
  const [calibInput, setCalibInput] = useState('');
  const [form, setForm] = useState<PendingForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const calibrated = unitsPerMeter !== null && unitsPerMeter > 0;
  const toMeters = useCallback((u: number) => (calibrated ? u / unitsPerMeter! : undefined), [calibrated, unitsPerMeter]);

  // PDF figūros išvedamos iš kiekių eilučių (vienintelis tiesos šaltinis – tėvinis state)
  const shapes = useMemo(() => items.filter((i) => i.pdfPoints && i.pdfPage === pageNum), [items, pageNum]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    file.arrayBuffer().then((buf) => pdfjsLib.getDocument({ data: buf }).promise)
      .then((doc) => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
      })
      .catch(() => setLoadError('Nepavyko atidaryti PDF failo. Patikrinkite, ar failas nepažeistas.'));
    return () => { cancelled = true; };
  }, [file]);

  // Puslapio piešimas
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    pdf.getPage(pageNum).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: zoom });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      setViewSize({ w: viewport.width, h: viewport.height });
      const ctx = canvas.getContext('2d')!;
      page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise.catch(() => undefined);
    });
    return () => { cancelled = true; };
  }, [pdf, pageNum, zoom]);

  const toPdfPt = (e: React.MouseEvent): Pt => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  const handleClick = (e: React.MouseEvent) => {
    if (tool === 'none' || form) return;
    const p = toPdfPt(e);
    if (tool === 'calib') {
      const next = [...calibPts, p].slice(-2);
      setCalibPts(next);
      return;
    }
    setCurrent((c) => [...c, p]);
  };

  const finishCurrent = () => {
    if (tool === 'length' && current.length >= 2) openForm('length', current);
    else if (tool === 'area' && current.length >= 3) openForm('area', current);
    else if (tool === 'count' && current.length >= 1) openForm('count', current);
  };

  const openForm = (kind: PendingForm['kind'], pts: Pt[]) => {
    const defCat: ElementCategory = kind === 'length' ? 'wall' : kind === 'area' ? 'slab' : 'column';
    setForm({
      kind, pts,
      category: defCat,
      name: `${CATEGORY_INFO[defCat].lt} (PDF p.${pageNum})`,
      height: kind === 'length' ? '3' : '',
      thickness: '',
      perArea: '', perVolume: '',
      material: '',
    });
    setCurrent([]);
  };

  const saveForm = () => {
    if (!form) return;
    const h = parseFloat(form.height.replace(',', '.'));
    const t = parseFloat(form.thickness.replace(',', '.'));
    const pa = parseFloat(form.perArea.replace(',', '.'));
    const pv = parseFloat(form.perVolume.replace(',', '.'));

    let length_m: number | undefined;
    let area_m2: number | undefined;
    let volume_m3: number | undefined;
    let count = 1;
    let unit: QtoItem['unit'] = 'm';

    if (form.kind === 'length') {
      const u = polylineLength(form.pts, false);
      length_m = round(toMeters(u) ?? 0, 3);
      if (!Number.isNaN(h)) {
        area_m2 = round(length_m * h, 3);
        unit = 'm²';
        if (!Number.isNaN(t)) { volume_m3 = round(area_m2 * t, 3); unit = 'm³'; }
      }
    } else if (form.kind === 'area') {
      const u = polygonArea(form.pts);
      area_m2 = calibrated ? round(u / (unitsPerMeter! * unitsPerMeter!), 3) : 0;
      unit = 'm²';
      if (!Number.isNaN(t)) { volume_m3 = round(area_m2 * t, 3); unit = 'm³'; }
    } else {
      count = form.pts.length;
      unit = 'vnt.';
      if (!Number.isNaN(pa)) area_m2 = round(pa * count, 3);
      if (!Number.isNaN(pv)) volume_m3 = round(pv * count, 3);
    }

    const item: QtoItem = {
      id: uid(),
      source: 'PDF',
      category: form.category,
      name: form.name || `${CATEGORY_INFO[form.category].lt} (PDF p.${pageNum})`,
      material: form.material || undefined,
      length_m: form.kind === 'length' ? length_m : undefined,
      height_m: form.kind === 'length' && !Number.isNaN(h) ? h : undefined,
      thickness_m: !Number.isNaN(t) ? t : undefined,
      area_m2,
      volume_m3,
      count,
      unit,
      pdfKind: form.kind,
      pdfPoints: form.pts,
      pdfPage: pageNum,
      pdfFile: fileId,
      discipline,
      note: !calibrated ? 'Mastelis nekalibruotas – reikšmės sąlyginės' : undefined,
    };
    onItemsChange([...items, item]);
    setForm(null);
  };

  const removeItem = (id: string) => {
    onItemsChange(items.filter((i) => i.id !== id));
  };

  const applyCalibration = () => {
    const real = parseFloat(calibInput.replace(',', '.'));
    if (calibPts.length === 2 && real > 0) {
      onCalibrate(dist(calibPts[0], calibPts[1]) / real);
      setTool('none');
    }
  };

  const resetCalibration = () => {
    onCalibrate(null);
    setCalibPts([]);
    setCalibInput('');
  };

  const liveLength = current.length >= 2 ? toMeters(polylineLength(current, false)) : undefined;
  const liveArea = current.length >= 3 && tool === 'area' ? (() => {
    const u = polygonArea(current);
    return calibrated ? u / (unitsPerMeter! * unitsPerMeter!) : undefined;
  })() : undefined;

  if (loadError) {
    return <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{loadError}</p>;
  }

  const pickTool = (t: Tool) => {
    // Ilgio / ploto matavimui mastelis būtinas – nukreipiame į kalibravimą
    if ((t === 'length' || t === 'area') && !calibrated) {
      setTool('calib');
      setCurrent([]);
      return;
    }
    setTool(tool === t ? 'none' : t);
    setCurrent([]);
  };

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => pickTool(t)}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
        tool === t ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
      )}
    >
      {icon}{label}
    </button>
  );

  const renderShape = (pts: Pt[], color: string, key: string, kind: string, label?: string) => {
    const pathPts = pts.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ');
    const mid = pts.length >= 2
      ? { x: (pts[0].x + pts[pts.length - 1].x) / 2, y: (pts[0].y + pts[pts.length - 1].y) / 2 }
      : pts[0];
    return (
      <g key={key}>
        {kind === 'area' && pts.length >= 3 && (
          <polygon points={pathPts} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={2} />
        )}
        {kind !== 'area' && pts.length >= 2 && (
          <polyline points={pathPts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        )}
        {kind === 'count'
          ? pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x * zoom} cy={p.y * zoom} r={7} fill={color} fillOpacity={0.85} />
              <text x={p.x * zoom} y={(p.y * zoom) + 3.5} textAnchor="middle" fontSize={9} fill="#fff" fontWeight={700}>{i + 1}</text>
            </g>
          ))
          : pts.map((p, i) => <circle key={i} cx={p.x * zoom} cy={p.y * zoom} r={3.5} fill={color} />)}
        {label && (
          <text x={mid.x * zoom + 6} y={mid.y * zoom - 6} fontSize={12} fontWeight={600} fill={color}
            style={{ paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3 }}>
            {label}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div>
        {/* Įrankių juosta */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {toolBtn('calib', <Ruler className="h-3.5 w-3.5" />, 'Mastelis')}
          {toolBtn('length', <Spline className="h-3.5 w-3.5" />, 'Ilgis (sienos)')}
          {toolBtn('area', <Pentagon className="h-3.5 w-3.5" />, 'Plotas')}
          {toolBtn('count', <Hash className="h-3.5 w-3.5" />, 'Skaičiuoti')}
          <span className="mx-1 h-5 w-px bg-border" />
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="rounded-lg border p-1.5 hover:bg-muted"><ZoomOut className="h-3.5 w-3.5" /></button>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="rounded-lg border p-1.5 hover:bg-muted"><ZoomIn className="h-3.5 w-3.5" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button disabled={pageNum <= 1} onClick={() => setPageNum((p) => p - 1)} className="rounded-lg border p-1.5 hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="flex items-center gap-1 text-xs tabular-nums">
            <input
              key={pageNum}
              defaultValue={pageNum}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = parseInt((e.target as HTMLInputElement).value, 10);
                  if (n >= 1 && n <= numPages) setPageNum(n);
                }
              }}
              onBlur={(e) => {
                const n = parseInt(e.target.value, 10);
                if (n >= 1 && n <= numPages && n !== pageNum) setPageNum(n);
              }}
              className="h-7 w-11 rounded-md border bg-background px-1 text-center text-xs"
              title="Puslapio numeris (Enter – peršokti)"
            />
            / {numPages}
          </span>
          <button disabled={pageNum >= numPages} onClick={() => setPageNum((p) => p + 1)} className="rounded-lg border p-1.5 hover:bg-muted disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
          {current.length > 0 && (
            <>
              <span className="mx-1 h-5 w-px bg-border" />
              <button onClick={finishCurrent} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                <Check className="h-3.5 w-3.5" /> Baigti ({current.length})
              </button>
              <button onClick={() => setCurrent([])} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">
                <X className="h-3.5 w-3.5" /> Valyti
              </button>
            </>
          )}
        </div>

        {!calibrated && (
          <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ Mastelis nesukalibruotas: pasirinkite „Mastelis“, spustelėkite du žinomus taškus (pvz., ašių sankirtas) ir įveskite realų atstumą metrais.
          </p>
        )}

        {/* Brėžinys + perdanga */}
        <div className="max-h-[640px] overflow-auto rounded-xl border bg-slate-100 dark:bg-slate-900">
          <div ref={wrapRef} className="relative inline-block cursor-crosshair" onClick={handleClick}>
            <canvas ref={canvasRef} className="block" />
            <svg width={viewSize.w} height={viewSize.h} className="absolute left-0 top-0">
              {/* Kalibravimo atkarpa */}
              {calibPts.length > 0 && renderShape(calibPts, '#f97316', 'calib', 'length',
                calibPts.length === 2 && calibrated ? `${fmt(dist(calibPts[0], calibPts[1]) / unitsPerMeter!)} m (etalonas)` : 'etalonas')}
              {/* Išsaugotos figūros */}
              {shapes.map((s) => {
                const color = CATEGORY_INFO[s.category].color;
                const label = s.pdfKind === 'length' && s.length_m !== undefined
                  ? `${fmt(s.length_m)} m`
                  : s.pdfKind === 'area' && s.area_m2 !== undefined
                    ? `${fmt(s.area_m2)} m²`
                    : s.pdfKind === 'count' ? `${s.count} vnt.` : undefined;
                return renderShape(s.pdfPoints!, color, s.id, s.pdfKind ?? 'length', label);
              })}
              {/* Dabartinė (daroma) figūra */}
              {current.length > 0 && renderShape(current, '#0ea5e9', 'current', tool === 'area' ? 'area' : tool === 'count' ? 'count' : 'length',
                tool === 'length' && liveLength !== undefined ? `${fmt(liveLength)} m`
                  : tool === 'area' && liveArea !== undefined ? `${fmt(liveArea)} m²`
                  : tool === 'count' ? `${current.length} vnt.` : undefined)}
            </svg>
          </div>
        </div>
      </div>

      {/* Šoninis stulpelis */}
      <div className="space-y-3">
        {/* Kalibravimo forma */}
        {tool === 'calib' && (
          <div className="rounded-xl border p-3 space-y-2">
            <p className="text-sm font-semibold">Mastelio kalibravimas</p>
            <p className="text-xs text-muted-foreground">
              {calibPts.length < 2
                ? `Spustelėkite ${calibPts.length === 0 ? 'pirmą' : 'antrą'} etaloninio atstumo tašką brėžinyje.`
                : 'Įveskite realų atstumą tarp pažymėtų taškų (metrais):'}
            </p>
            {calibPts.length === 2 && (
              <div className="flex gap-1.5">
                <input
                  value={calibInput}
                  onChange={(e) => setCalibInput(e.target.value)}
                  placeholder="pvz., 6.00"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  inputMode="decimal"
                />
                <button onClick={applyCalibration} className="rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">OK</button>
              </div>
            )}
            {calibrated && (
              <p className="text-xs text-emerald-600">✓ Aktyvus kalibravimas: {fmt(unitsPerMeter!, 1)} vnt./m</p>
            )}
            {calibrated && (
              <button onClick={resetCalibration} className="text-xs text-muted-foreground underline">Atšaukti kalibravimą</button>
            )}
          </div>
        )}

        {/* Naujo matavimo forma */}
        {form && (
          <div className="rounded-xl border border-primary/50 p-3 space-y-2">
            <p className="text-sm font-semibold">
              {form.kind === 'length' ? 'Linijinis matavimas' : form.kind === 'area' ? 'Ploto matavimas' : `Skaičiavimas (${form.pts.length} vnt.)`}
            </p>
            <label className="block text-xs">
              Kategorija
              <select
                value={form.category}
                onChange={(e) => {
                  const cat = e.target.value as ElementCategory;
                  const autoName = `${CATEGORY_INFO[form.category].lt} (PDF p.${pageNum})`;
                  setForm({
                    ...form,
                    category: cat,
                    name: form.name === autoName ? `${CATEGORY_INFO[cat].lt} (PDF p.${pageNum})` : form.name,
                  });
                }}
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_INFO[c].lt}</option>)}
              </select>
            </label>
            <label className="block text-xs">
              Pavadinimas
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
            </label>
            {form.kind === 'length' && (
              <label className="block text-xs">
                Aukštis (m) – sienoms
                <input value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })}
                  inputMode="decimal" className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
              </label>
            )}
            {(form.kind === 'length' || form.kind === 'area') && (
              <label className="block text-xs">
                Storis (m) – tūriui
                <input value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })}
                  inputMode="decimal" placeholder="neprivaloma"
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
              </label>
            )}
            {form.kind === 'count' && (
              <>
                <label className="block text-xs">
                  Plotas vienam vnt. (m²)
                  <input value={form.perArea} onChange={(e) => setForm({ ...form, perArea: e.target.value })}
                    inputMode="decimal" placeholder="neprivaloma"
                    className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
                </label>
                <label className="block text-xs">
                  Tūris vienam vnt. (m³)
                  <input value={form.perVolume} onChange={(e) => setForm({ ...form, perVolume: e.target.value })}
                    inputMode="decimal" placeholder="neprivaloma"
                    className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
                </label>
              </>
            )}
            <label className="block text-xs">
              Medžiaga
              <input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}
                placeholder="pvz., Mūras, gelžbetonis"
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
            </label>
            <div className="flex gap-1.5 pt-1">
              <button onClick={saveForm} className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Įtraukti</button>
              <button onClick={() => setForm(null)} className="rounded-md border px-3 py-1.5 text-sm">Atšaukti</button>
            </div>
          </div>
        )}

        {/* Matavimų sąrašas */}
        <div className="rounded-xl border p-3">
          <p className="mb-2 text-sm font-semibold">Matavimai ({items.length})</p>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Pasirinkite įrankį („Ilgis“, „Plotas“ arba „Skaičiuoti“), žymėkite brėžinyje, spauskite „Baigti“ ir užpildykite formą.
            </p>
          )}
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_INFO[i.category].color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="text-muted-foreground tabular-nums">
                    {i.length_m !== undefined && `${fmt(i.length_m)} m · `}
                    {i.area_m2 !== undefined && `${fmt(i.area_m2)} m² · `}
                    {i.volume_m3 !== undefined && `${fmt(i.volume_m3)} m³ · `}
                    {i.count} vnt. · p.{i.pdfPage}
                  </p>
                </div>
                <button onClick={() => removeItem(i.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
