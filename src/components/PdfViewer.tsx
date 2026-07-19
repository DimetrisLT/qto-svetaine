import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Ruler, Spline, Pentagon, Hash, Trash2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Check, X, ScanText, ClipboardPlus, Layers, Eye, EyeOff, ScanSearch } from 'lucide-react';
import { CATEGORY_INFO, CATEGORY_ORDER, uid, type ElementCategory, type QtoItem } from '@/types/qto';
import { dist, polygonArea, polylineLength, type Pt } from '@/lib/pdf/measure';
import { fmt, round } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ocrCanvas, parseScheduleText, rowsToItems, extractVisoTotals, type ScannedRow } from '@/lib/ocr/scanSchedule';
import ScheduleReview from '@/components/ScheduleReview';
import { suggestForPage, paperFromPoints, unitsPerMeterFor, deviationPct, type ScaleSuggestion } from '@/lib/pdf/scaleDetect';
import {
  TextIndex, suggestName, extractDimensions, estimateScaleFromDimensions, checkLengthAgainstDimensions,
  type DimensionItem, type DimensionScaleEstimate, type TextItem,
} from '@/lib/pdf/textItems';
import { extractTextItems } from '@/lib/pdf/textItems';
import { ocrTextItems } from '@/lib/ocr/pageText';
import { extractSegments, SnapIndex } from '@/lib/pdf/vectorSnap';
import { detectAxes, snapToAxes, axisZone, type AxisGrid } from '@/lib/pdf/axes';
import { buildRoomFinishItems } from '@/lib/pdf/roomFinishes';
import { grayscaleFromCanvas, matchTemplate, cropGray, binarizeDilate } from '@/lib/ocr/templateMatch';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

type Tool = 'none' | 'calib' | 'length' | 'area' | 'count' | 'scan' | 'match';

interface SymbolMatch {
  /** Centro taškas PDF pt (scale 1) */
  x: number;
  y: number;
  score: number;
  thumb: string;
  excluded: boolean;
}

interface ScanRect {
  x0: number; y0: number; x1: number; y1: number;
}

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
  /** Pavadinimas pasiūlytas automatiškai pagal artimiausią žymą */
  nameSuggested?: boolean;
  /** Artimiausios matmenų grandinės sutikrinimas (mm) */
  dimCheck?: { dimMm: number; ok: boolean } | null;
  /** Ašių tinklelio zona ties elemento centroidu (pvz. „A–B / 3–4“) */
  axesZone?: string | null;
  /** Patalpos apdailos pozicijų generavimas (kategorijai „Patalpos“) */
  genFinishes?: boolean;
  roomHeight?: string;
  deductOpenings?: boolean;
}

interface Props {
  fileId: string;
  file: File;
  discipline: string;
  unitsPerMeter: number | null;
  onCalibrate: (upm: number | null) => void;
  /** Automatiškai aptiktas mastelis (vieną kartą, pirmas sėkmingas) */
  onDetectScale?: (upm: number | null) => void;
  items: QtoItem[];
  onItemsChange: (items: QtoItem[]) => void;
}

export default function PdfViewer({ fileId, file, discipline, unitsPerMeter, onCalibrate, onDetectScale, items, onItemsChange }: Props) {
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
  const [scanRect, setScanRect] = useState<ScanRect | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [reviewRows, setReviewRows] = useState<ScannedRow[] | null>(null);
  const [reviewTitle, setReviewTitle] = useState('');
  const [scaleSuggestion, setScaleSuggestion] = useState<ScaleSuggestion | null>(null);
  const [paperOnlyName, setPaperOnlyName] = useState<string | null>(null);
  const [calibDeviation, setCalibDeviation] = useState<number | null>(null);
  const detectReportedRef = useRef(false);
  const snapIndexRef = useRef<SnapIndex | null>(null);
  const snapRef = useRef<Pt | null>(null);
  const visoRef = useRef<number[] | undefined>(undefined);
  const [snapIndicator, setSnapIndicator] = useState<Pt | null>(null);
  const snapPrevRef = useRef<Pt | null>(null);
  // Teksto elementai (žymoms ir matmenų grandinėms): teksto sluoksnis arba OCR rastrui
  const textIndexRef = useRef<TextIndex | null>(null);
  const dimsRef = useRef<DimensionItem[]>([]);
  const segsDataRef = useRef<{ count: number; data: Float32Array } | null>(null);
  const [dimScale, setDimScale] = useState<DimensionScaleEstimate | null>(null);
  const [ocrScale, setOcrScale] = useState<ScaleSuggestion | null>(null);
  // Ašių tinklelis (#5): statomas tingiai iš segmentų + teksto (undefined = dar neieškota)
  const axesRef = useRef<AxisGrid | null | undefined>(undefined);
  const textItemsRef = useRef<TextItem[] | null>(null);
  const pageSizeRef = useRef<{ w: number; h: number } | null>(null);
  // PDF sluoksniai – Optional Content Groups (#1)
  const ocgConfigRef = useRef<any>(null);
  const [layers, setLayers] = useState<{ id: string; name: string; visible: boolean }[]>([]);
  const [layersOpen, setLayersOpen] = useState(false);
  const [layerTick, setLayerTick] = useState(0);
  // Simbolių paieška šablonu (#1)
  const [matchResults, setMatchResults] = useState<SymbolMatch[] | null>(null);
  const [matching, setMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState(0);
  const [matchThumb, setMatchThumb] = useState<string | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

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
      .then(async (doc) => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
        // PDF sluoksniai (OCG) – jei brėžinys eksportuotas su sluoksniais
        try {
          const cfg: any = await doc.getOptionalContentConfig();
          if (cancelled || !cfg) return;
          // pdf.js v5: grupių sąrašas per getOrder() (gali būti įdėtinių masyvų) + getGroup(id)
          const flat = (a: any[]): any[] => a.flatMap((x) => (Array.isArray(x) ? flat(x) : [x]));
          const ids: string[] = typeof cfg.getOrder === 'function' ? flat(cfg.getOrder() ?? []) : [];
          const entries = ids
            .map((id) => [id, cfg.getGroup?.(id)] as [string, any])
            .filter(([, g]) => g);
          if (entries.length === 0) return;
          ocgConfigRef.current = cfg;
          const vis = await Promise.all(
            entries.map(([, g]) => Promise.resolve(cfg.isVisible?.(g)).catch(() => true).then((v) => v !== false)),
          );
          if (cancelled) return;
          setLayers(entries.map(([id, g], i) => ({
            id,
            name: typeof g?.name === 'string' && g.name ? g.name : `Sluoksnis ${i + 1}`,
            visible: vis[i],
          })));
        } catch { /* sluoksnių nėra arba API nepalaikoma – ignoruojame */ }
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
      const renderParams: any = {
        canvas,
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      };
      if (ocgConfigRef.current) {
        // pdf.js v5: parametras yra Promise<OptionalContentConfig>
        renderParams.optionalContentConfigPromise = Promise.resolve(ocgConfigRef.current);
      }
      page.render(renderParams).promise.catch(() => undefined);
    });
    return () => { cancelled = true; };
    // layerTick – perpiešimas perjungus sluoksnio matomumą
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum, zoom, layerTick]);

  // Automatinis mastelio aptikimas: mastelio žyma tekste + lapo formatas
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    pdf.getPage(pageNum).then(async (page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1 });
      let text = '';
      try {
        const tc = await page.getTextContent();
        text = tc.items.map((it) => ('str' in it ? it.str : '')).join(' ');
      } catch { /* nėra teksto sluoksnio */ }
      if (cancelled) return;
      const sug = suggestForPage(viewport.width, viewport.height, text);
      if (sug) {
        setScaleSuggestion(sug);
        setPaperOnlyName(null);
        if (!detectReportedRef.current) {
          detectReportedRef.current = true;
          onDetectScale?.(sug.unitsPerMeter);
        }
      } else {
        const paper = paperFromPoints(viewport.width, viewport.height);
        if (paper) setPaperOnlyName(paper.name);
      }
    });
    return () => { cancelled = true; };
    // Suggestion iš ankstesnių puslapių išlaikome – brėžinių lapuose mastelis dažniausiai vienodas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNum]);

  // Vektorinių segmentų indeksas prisirišimui (snapping)
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    snapIndexRef.current = null;
    segsDataRef.current = null;
    axesRef.current = undefined;
    pdf.getPage(pageNum).then(async (page) => {
      try {
        const vp = page.getViewport({ scale: 1 });
        if (!cancelled) pageSizeRef.current = { w: vp.width, h: vp.height };
        const segs = await extractSegments(page);
        if (!cancelled && segs) {
          snapIndexRef.current = new SnapIndex(segs);
          segsDataRef.current = segs;
        }
      } catch { /* vektorių nėra (skenuotas PDF) – snapping tiesiog neveikia */ }
    });
    return () => { cancelled = true; };
  }, [pdf, pageNum]);

  // Teksto elementai žymoms (#5) ir matmenų grandinėms (#1):
  // vektoriniam PDF – teksto sluoksnis; rastriniam – OCR su pozicijomis
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    textIndexRef.current = null;
    textItemsRef.current = null;
    axesRef.current = undefined;
    dimsRef.current = [];
    setDimScale(null);
    setOcrScale(null);
    pdf.getPage(pageNum).then(async (page) => {
      let items = await extractTextItems(page);
      let fromOcr = false;
      if (!items) {
        // Rastras: OCR (lėta, ~10–20 s) – naudinga ir mastelio žymai, ir žymų pasiūlymams
        items = await ocrTextItems(page).catch(() => null);
        fromOcr = true;
      }
      if (cancelled || !items) return;
      textIndexRef.current = new TextIndex(items);
      textItemsRef.current = items;
      dimsRef.current = extractDimensions(items);

      if (fromOcr) {
        // Rastras: mastelio žyma („M 1:100“) iš OCR teksto
        const text = items.map((i) => i.str).join(' ');
        const viewport = page.getViewport({ scale: 1 });
        const sug = suggestForPage(viewport.width, viewport.height, text);
        if (!cancelled && sug) setOcrScale(sug);
      } else if (dimsRef.current.length > 0) {
        // Vektorius: mastelio įvertis iš matmenų grandinių (skaičius šalia ilgo segmento)
        let segs = segsDataRef.current;
        if (!segs) {
          try {
            segs = (await extractSegments(page)) ?? null;
            if (segs) segsDataRef.current = segs;
          } catch { /* ignore */ }
        }
        if (!cancelled && segs) {
          const est = estimateScaleFromDimensions(dimsRef.current, segs.data, segs.count);
          if (est && est.evidence >= 1) setDimScale(est);
        }
      }
    });
    return () => { cancelled = true; };
  }, [pdf, pageNum]);

  const toPdfPt = (e: React.MouseEvent): Pt => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  // Ašių tinklelis statomas tingiai (pirmą kartą prireikus) iš segmentų + teksto žymių
  const getAxes = (): AxisGrid | null => {
    if (axesRef.current === undefined) {
      const segs = segsDataRef.current;
      const texts = textItemsRef.current;
      const ps = pageSizeRef.current;
      axesRef.current = segs && texts && ps
        ? detectAxes(segs.data, segs.count, texts, ps.w, ps.h)
        : null;
    }
    return axesRef.current ?? null;
  };

  const toggleLayer = (id: string, visible: boolean) => {
    try { ocgConfigRef.current?.setVisibility(id, visible); } catch { /* ignore */ }
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, visible } : l)));
    setLayerTick((t) => t + 1);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (tool === 'none' || tool === 'scan' || tool === 'match' || form) return;
    const p = snapRef.current ?? toPdfPt(e);
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
    // #5: pavadinimas iš artimiausios žymos (patalpa „107 …“, markė „S-12“…)
    const suggested = suggestName(textIndexRef.current, pts);
    // #1: ilgio sutikrinimas su artimiausia matmenų grandine (±2 %)
    let dimCheck: { dimMm: number; ok: boolean } | null = null;
    if (kind === 'length' && calibrated) {
      const mm = (polylineLength(pts, false) / unitsPerMeter!) * 1000;
      dimCheck = checkLengthAgainstDimensions(dimsRef.current, pts, mm);
    }
    // #5: ašių tinklelio zona ties elemento centroidu (pvz. „A–B / 3–4“)
    const centroid = pts.length
      ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
      : null;
    const axesZoneVal = centroid ? axisZone(getAxes(), centroid) : null;
    setForm({
      kind, pts,
      category: defCat,
      name: suggested ?? `${CATEGORY_INFO[defCat].lt} (PDF p.${pageNum})`,
      height: kind === 'length' ? '3' : '',
      thickness: '',
      perArea: '', perVolume: '',
      material: '',
      nameSuggested: suggested !== null,
      dimCheck,
      axesZone: axesZoneVal,
      genFinishes: kind === 'area',
      roomHeight: '2.7',
      deductOpenings: true,
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
      // Perimetras – informatyvu visoms ploto pozicijoms, būtina patalpų apdailai
      length_m = round(toMeters(polylineLength(form.pts, true)) ?? 0, 3);
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
      length_m,
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
      origin: 'ai',
      note: [
        !calibrated ? 'Mastelis nekalibruotas – reikšmės sąlyginės' : null,
        form.axesZone ? `Ašys: ${form.axesZone}` : null,
      ].filter(Boolean).join('; ') || undefined,
    };
    // Patalpos apdaila: grindys + lubos + sienos (su angų atėmimu)
    let extra: QtoItem[] = [];
    if (form.kind === 'area' && form.category === 'room' && form.genFinishes) {
      const h = parseFloat((form.roomHeight ?? '').replace(',', '.'));
      extra = buildRoomFinishItems(item, items, {
        heightM: Number.isNaN(h) ? 2.7 : h,
        deductOpenings: form.deductOpenings !== false,
        openingThresholdM2: 0.5,
      });
    }
    onItemsChange([...items, item, ...extra]);
    setForm(null);
  };

  const removeItem = (id: string) => {
    onItemsChange(items.filter((i) => i.id !== id));
  };

  const applyCalibration = () => {
    const real = parseFloat(calibInput.replace(',', '.'));
    if (calibPts.length === 2 && real > 0) {
      const upm = dist(calibPts[0], calibPts[1]) / real;
      if (scaleSuggestion) {
        const dev = deviationPct(upm, scaleSuggestion.unitsPerMeter);
        setCalibDeviation(dev > 2 ? dev : null);
      }
      onCalibrate(upm);
      setTool('none');
    }
  };

  const resetCalibration = () => {
    onCalibrate(null);
    setCalibPts([]);
    setCalibInput('');
  };

  // --- Žiniaraščio skaitymas (OCR) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((tool !== 'scan' && tool !== 'match') || reviewRows || scanning || matchResults) return;
    const p = toPdfPt(e);
    setScanRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (tool === 'scan' || tool === 'match') {
      if (!scanRect || e.buttons !== 1) return;
      const p = toPdfPt(e);
      setScanRect({ ...scanRect, x1: p.x, y1: p.y });
      return;
    }
    // Prisirišimas (snapping) matavimo įrankiams: pirmiausia ašių sankirtos, po to vektoriai
    if (tool === 'none' || form) return;
    const p = toPdfPt(e);
    const ax = snapToAxes(getAxes(), p, 12 / zoom);
    const next = ax ?? snapIndexRef.current?.snap(p, 9 / zoom)?.p ?? null;
    snapRef.current = next;
    const prev = snapPrevRef.current;
    const changed = (next === null) !== (prev === null)
      || (next && prev && (Math.abs(next.x - prev.x) > 0.5 || Math.abs(next.y - prev.y) > 0.5));
    if (changed) {
      snapPrevRef.current = next;
      setSnapIndicator(next);
    }
  };

  const handleMouseUp = () => {
    if (tool === 'match' && scanRect) {
      const r = scanRect;
      setScanRect(null);
      void runMatch(r);
      return;
    }
    if (tool !== 'scan' || !scanRect) return;
    const r = scanRect;
    setScanRect(null);
    void runScan(r);
  };

  // --- Simbolių paieška šablonu (#1): rėmelis ant simbolio → ZNCC atitikmenys → QC ---
  const runMatch = async (r: ScanRect) => {
    if (!pdf) return;
    const wPt = Math.abs(r.x1 - r.x0);
    const hPt = Math.abs(r.y1 - r.y0);
    if (wPt < 6 || hPt < 6) return;
    setMatching(true);
    setMatchError(null);
    setMatchProgress(0);
    try {
      const page = await pdf.getPage(pageNum);
      const vp1 = page.getViewport({ scale: 1 });
      // Paieškos drobė: ~760 px pločio – pakankama raiška ir pakankamai greita
      const s = Math.min(2, 760 / vp1.width);
      const viewport = page.getViewport({ scale: s });
      const c = document.createElement('canvas');
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      const cctx = c.getContext('2d')!;
      cctx.fillStyle = '#fff';
      cctx.fillRect(0, 0, c.width, c.height);
      const rp: any = { canvas: c, canvasContext: cctx, viewport };
      if (ocgConfigRef.current) rp.optionalContentConfigPromise = Promise.resolve(ocgConfigRef.current);
      await page.render(rp).promise;

      const { g: gRaw, w: iw, h: ih } = grayscaleFromCanvas(c);
      // Binarizacija + dilatacija: plonos vektorinės linijos tampa atsparios subpikseliams
      const g = binarizeDilate(gRaw, iw, ih);
      const tx = Math.floor(Math.min(r.x0, r.x1) * s);
      const ty = Math.floor(Math.min(r.y0, r.y1) * s);
      const tw = Math.max(6, Math.round(wPt * s));
      const th = Math.max(6, Math.round(hPt * s));
      if (tw > 200 || th > 200) {
        setMatchError('Šablono sritis per didelė (max ~200 px). Pažymėkite vieną simbolį – pvz., durų ar lango grafiklį.');
        setMatching(false);
        return;
      }
      const tpl = cropGray(g, iw, tx, ty, tw, th);
      // Šablono miniatiūra peržiūrai
      const tcan = document.createElement('canvas');
      tcan.width = tw; tcan.height = th;
      tcan.getContext('2d')!.drawImage(c, tx, ty, tw, th, 0, 0, tw, th);
      setMatchThumb(tcan.toDataURL());

      const found = await matchTemplate(g, iw, ih, tpl, tw, th, {
        threshold: 0.6,
        onProgress: setMatchProgress,
      });
      if (found.length === 0) {
        setMatchError('Panašių simbolių nerasta. Pabandykite pažymėti tikslesnę sritį (tik simbolio kontūras, be teksto).');
        setMatching(false);
        return;
      }
      // Miniatiūros su kontekstu (1,8× šablono)
      const results: SymbolMatch[] = found.map((m) => {
        const cw = Math.round(tw * 1.8), ch = Math.round(th * 1.8);
        const cx = Math.max(0, Math.min(iw - cw, Math.round(m.x - cw / 2)));
        const cy = Math.max(0, Math.min(ih - ch, Math.round(m.y - ch / 2)));
        const t2 = document.createElement('canvas');
        t2.width = cw; t2.height = ch;
        t2.getContext('2d')!.drawImage(c, cx, cy, cw, ch, 0, 0, cw, ch);
        return { x: m.x / s, y: m.y / s, score: m.score, thumb: t2.toDataURL(), excluded: false };
      });
      setMatchResults(results);
    } catch (err) {
      console.error(err);
      setMatchError('Simbolių paieška nepavyko. Bandykite dar kartą su mažesne sritimi.');
    } finally {
      setMatching(false);
    }
  };

  const acceptMatches = () => {
    if (!matchResults) return;
    const pts = matchResults.filter((m) => !m.excluded).map((m) => ({ x: m.x, y: m.y }));
    setMatchResults(null);
    setMatchThumb(null);
    if (pts.length > 0) openForm('count', pts);
  };

  const runScan = async (r: ScanRect) => {
    if (!pdf) return;
    const w = Math.abs(r.x1 - r.x0);
    const h = Math.abs(r.y1 - r.y0);
    if (w < 20 || h < 10) return;
    setScanning(true);
    setScanError(null);
    try {
      const page = await pdf.getPage(pageNum);
      const scale = 3; // ~216 dpi – pakanka OCR
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * scale);
      c.height = Math.ceil(h * scale);
      const cctx = c.getContext('2d')!;
      const viewport = page.getViewport({ scale });
      await page.render({
        canvas: c,
        canvasContext: cctx,
        viewport,
        transform: [1, 0, 0, 1, -Math.min(r.x0, r.x1) * scale, -Math.min(r.y0, r.y1) * scale],
      }).promise;
      const text = await ocrCanvas(c);
      setScanPreview(c.toDataURL('image/png'));
      const rows = parseScheduleText(text);
      if (rows.length === 0) {
        setScanError('Pažymėtoje srityje kiekių pozicijų neaptikta. Pabandykite pažymėti tikslesnę lentelės sritį arba įveskite poziciją ranka.');
      } else {
        visoRef.current = extractVisoTotals(text);
        setReviewRows(rows);
        setReviewTitle(`Nuskaityta iš p.${pageNum} – aptikta ${rows.length} poz.`);
      }
    } catch (err) {
      console.error(err);
      setScanError('OCR nepavyko (reikalingas interneto ryšys pirmam OCR variklio užkėlimui). Bandykite dar kartą.');
    } finally {
      setScanning(false);
    }
  };

  const openManualEntry = () => {
    setScanError(null);
    setReviewRows([]);
    setReviewTitle('Projekto pozicijos įvedimas ranka');
  };

  const saveReview = (rows: ScannedRow[]) => {
    const newItems = rowsToItems(rows, { fileId, fileName: file.name, discipline, page: pageNum }, visoRef.current);
    if (newItems.length) onItemsChange([...items, ...newItems]);
    visoRef.current = undefined;
    setReviewRows(null);
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
    snapRef.current = null;
    snapPrevRef.current = null;
    setSnapIndicator(null);
    setMatchResults(null);
    setMatchThumb(null);
    setMatchError(null);
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
          {toolBtn('match', <ScanSearch className="h-3.5 w-3.5" />, 'Simboliai')}
          {toolBtn('scan', <ScanText className="h-3.5 w-3.5" />, 'Žiniaraštis (OCR)')}
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
          {layers.length > 0 && (
            <span className="relative">
              <span className="mx-1 h-5 w-px bg-border" />
              <button
                onClick={() => setLayersOpen((o) => !o)}
                onBlur={() => setTimeout(() => setLayersOpen(false), 150)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted',
                  layersOpen && 'border-primary',
                )}
              >
                <Layers className="h-3.5 w-3.5" /> Sluoksniai ({layers.filter((l) => l.visible).length}/{layers.length})
              </button>
              {layersOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-72 overflow-auto rounded-lg border bg-popover p-1.5 shadow-lg">
                  {layers.map((l) => (
                    <button
                      key={l.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleLayer(l.id, !l.visible)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      {l.visible
                        ? <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
                        : <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className={cn(!l.visible && 'text-muted-foreground line-through')}>{l.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
          {/* Visada rezervuojame vietą – kad brėžinys „nešoktų“ žymint pirmą tašką */}
          <span className={cn('flex items-center gap-1.5', current.length === 0 && 'invisible')} aria-hidden={current.length === 0}>
            <span className="mx-1 h-5 w-px bg-border" />
            <button onClick={finishCurrent} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
              <Check className="h-3.5 w-3.5" /> Baigti ({current.length})
            </button>
            <button onClick={() => setCurrent([])} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">
              <X className="h-3.5 w-3.5" /> Valyti
            </button>
          </span>
        </div>

        {!calibrated && scaleSuggestion && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <span>
              📐 Aptikta: <b>{scaleSuggestion.paperName}</b> lapas, mastelis <b>1:{scaleSuggestion.scale}</b>.
            </span>
            <button
              onClick={() => { onCalibrate(scaleSuggestion.unitsPerMeter); setCalibDeviation(null); }}
              className="rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
            >
              Taikyti šį mastelį
            </button>
            <span className="text-emerald-800/70 dark:text-emerald-300/70">arba sukalibruokite ranka („Mastelis“ + du žinomi taškai)</span>
          </div>
        )}
        {!calibrated && !scaleSuggestion && (dimScale || ocrScale) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
            {ocrScale ? (
              <span>🔍 Iš skenuoto lapo nuskaityta: mastelis <b>1:{ocrScale.scale}</b> ({ocrScale.paperName}, OCR).</span>
            ) : dimScale && (
              <span>
                📏 Mastelis pagal matmenų grandines: <b>~1:{Math.round((72 / 25.4 * 1000) / dimScale.unitsPerMeter)}</b>
                {' '}({dimScale.evidence} grand., pvz., {dimScale.sample}).
              </span>
            )}
            <button
              onClick={() => { onCalibrate(ocrScale ? ocrScale.unitsPerMeter : dimScale!.unitsPerMeter); setCalibDeviation(null); }}
              className="rounded-md bg-sky-600 px-2.5 py-1 font-semibold text-white hover:bg-sky-700"
            >
              Taikyti šį mastelį
            </button>
            <span className="text-sky-800/70 dark:text-sky-300/70">patikrinkite su vienu žinomu atstumu</span>
          </div>
        )}
        {!calibrated && !scaleSuggestion && (
          <div className="mb-2 space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <p>⚠️ Mastelis nesukalibruotas: pasirinkite „Mastelis“, spustelėkite du žinomus taškus (pvz., ašių sankirtas) ir įveskite realų atstumą metrais.</p>
            {paperOnlyName && (
              <p className="flex flex-wrap items-center gap-1.5">
                <span>Lapas panašus į <b>{paperOnlyName}</b>. Apytikslis mastelis:</span>
                {[50, 100, 200].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      const upm = unitsPerMeterFor(viewSize.w / zoom, viewSize.h / zoom, s);
                      if (upm) onCalibrate(upm);
                    }}
                    className="rounded-md border border-amber-400 bg-white/60 px-2 py-0.5 font-semibold hover:bg-amber-100 dark:bg-transparent"
                  >
                    1:{s}
                  </button>
                ))}
                <span className="text-amber-800/70 dark:text-amber-300/70">– tikslumui būtinai patikrinkite vienu žinomu matmeniu (brėžinys gali būti spausdintas „talpinant į lapą“)</span>
              </p>
            )}
          </div>
        )}
        {calibrated && calibDeviation !== null && scaleSuggestion && (
          <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ Rankinė kalibracija nukrypsta {fmt(calibDeviation, 1)} % nuo brėžinyje nurodyto mastelio 1:{scaleSuggestion.scale} ({scaleSuggestion.paperName}). Patikrinkite etaloną arba{' '}
            <button
              onClick={() => { onCalibrate(scaleSuggestion.unitsPerMeter); setCalibDeviation(null); }}
              className="font-semibold underline"
            >
              taikykite aptiktą mastelį
            </button>.
          </p>
        )}

        {/* Brėžinys + perdanga */}
        <div className="max-h-[640px] overflow-auto rounded-xl border bg-slate-100 dark:bg-slate-900">
          <div
            ref={wrapRef}
            className="relative inline-block cursor-crosshair"
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
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
              {/* Prisirišimo (snapping) indikatorius */}
              {snapIndicator && (
                <g pointerEvents="none">
                  <circle cx={snapIndicator.x * zoom} cy={snapIndicator.y * zoom} r={6} fill="none" stroke="#0ea5e9" strokeWidth={2} />
                  <line x1={snapIndicator.x * zoom - 10} y1={snapIndicator.y * zoom} x2={snapIndicator.x * zoom + 10} y2={snapIndicator.y * zoom} stroke="#0ea5e9" strokeWidth={1.5} />
                  <line x1={snapIndicator.x * zoom} y1={snapIndicator.y * zoom - 10} x2={snapIndicator.x * zoom} y2={snapIndicator.y * zoom + 10} stroke="#0ea5e9" strokeWidth={1.5} />
                </g>
              )}
              {/* Simbolių paieškos atitikmenys */}
              {matchResults?.map((m, i) => (
                <g key={`m${i}`} pointerEvents="none" opacity={m.excluded ? 0.35 : 1}>
                  <circle cx={m.x * zoom} cy={m.y * zoom} r={8} fill={m.excluded ? '#94a3b8' : '#f59e0b'} fillOpacity={0.3}
                    stroke={m.excluded ? '#94a3b8' : '#f59e0b'} strokeWidth={2} />
                  {m.excluded && (
                    <line x1={m.x * zoom - 5} y1={m.y * zoom - 5} x2={m.x * zoom + 5} y2={m.y * zoom + 5} stroke="#ef4444" strokeWidth={2} />
                  )}
                </g>
              ))}
              {/* OCR srities rėmelis */}
              {scanRect && (
                <rect
                  x={Math.min(scanRect.x0, scanRect.x1) * zoom}
                  y={Math.min(scanRect.y0, scanRect.y1) * zoom}
                  width={Math.abs(scanRect.x1 - scanRect.x0) * zoom}
                  height={Math.abs(scanRect.y1 - scanRect.y0) * zoom}
                  fill="#8b5cf6"
                  fillOpacity={0.12}
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                />
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* Šoninis stulpelis */}
      <div className="space-y-3">
        {/* OCR būsena ir žiniaraščio peržiūra */}
        {tool === 'scan' && !scanning && !reviewRows && (
          <div className="rounded-xl border border-violet-300 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
            Nuspauskite ir užtempkite rėmelį ant <b>žiniaraščio / eksplikacijos lentelės</b> brėžinyje – programa nuskaitys pozicijas (pavadinimas, vnt., kiekis) ir leis patikrinti prieš įtraukiant.
          </div>
        )}
        {scanning && (
          <div className="rounded-xl border p-3 text-sm">
            <p className="font-medium">Skaitoma (OCR)…</p>
            <p className="text-xs text-muted-foreground">Pirmasis kartas gali užtrukti ~10–20 s (kraunamas OCR variklis).</p>
          </div>
        )}
        {scanError && (
          <div className="space-y-2">
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              ⚠️ {scanError}
            </p>
            {scanPreview && (
              <div className="rounded-lg border p-1.5">
                <p className="mb-1 text-[10px] text-muted-foreground">Nuskaityta sritis:</p>
                <img src={scanPreview} alt="OCR sritis" className="w-full rounded" />
              </div>
            )}
          </div>
        )}
        {reviewRows !== null && (
          <ScheduleReview
            rows={reviewRows}
            title={reviewTitle}
            onSave={saveReview}
            onCancel={() => setReviewRows(null)}
          />
        )}
        {/* Simbolių paieška (#1) */}
        {tool === 'match' && !matching && !matchResults && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Nuspauskite ir užtempkite rėmelį ant <b>vieno simbolio</b> (durų, lango, gaubto, šviestuvo grafiklio) – programa ras visus identiškus puslapyje ir leis patikrinti prieš skaičiuojant.
          </div>
        )}
        {matching && (
          <div className="rounded-xl border p-3 text-sm">
            <p className="font-medium">Ieškoma simbolių… {Math.round(matchProgress * 100)} %</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-amber-500 transition-all" style={{ width: `${matchProgress * 100}%` }} />
            </div>
          </div>
        )}
        {matchError && !matching && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ {matchError}
          </p>
        )}
        {matchResults && (
          <div className="rounded-xl border p-3">
            <div className="mb-2 flex items-center gap-2">
              {matchThumb && <img src={matchThumb} alt="Šablonas" className="h-10 rounded border" />}
              <div>
                <p className="text-sm font-semibold">
                  Rasta {matchResults.filter((m) => !m.excluded).length} iš {matchResults.length}
                </p>
                <p className="text-[11px] text-muted-foreground">Spauskite miniatiūrą, kad išmestumėte klaidingą</p>
              </div>
            </div>
            <div className="mb-3 grid max-h-56 grid-cols-4 gap-1.5 overflow-auto">
              {matchResults.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setMatchResults((rs) => rs?.map((x, j) => (j === i ? { ...x, excluded: !x.excluded } : x)) ?? null)}
                  className={`relative overflow-hidden rounded border ${m.excluded ? 'opacity-40 grayscale' : 'border-amber-400'}`}
                  title={`Panašumas ${(m.score * 100).toFixed(0)} %`}
                >
                  <img src={m.thumb} alt={`atitikmuo ${i + 1}`} className="w-full" />
                  {m.excluded && <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-red-600">✕</span>}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={acceptMatches}
                disabled={matchResults.every((m) => m.excluded)}
                className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Įtraukti {matchResults.filter((m) => !m.excluded).length} vnt.
              </button>
              <button
                onClick={() => { setMatchResults(null); setMatchThumb(null); }}
                className="rounded-lg border px-3 py-2 text-xs hover:bg-muted"
              >
                Atšaukti
              </button>
            </div>
          </div>
        )}
        {!reviewRows && !scanning && (
          <button
            onClick={openManualEntry}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary"
          >
            <ClipboardPlus className="h-3.5 w-3.5" /> Įvesti projekto poziciją ranka
          </button>
        )}
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
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, nameSuggested: false })}
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
              {form.nameSuggested && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">✨ pasiūlyta pagal artimiausią žymą brėžinyje – galite redaguoti</span>
              )}
            </label>
            {form.axesZone && (
              <p className="rounded-md bg-sky-50 px-2 py-1.5 text-[11px] text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                ⊹ Ašių zona: <b>{form.axesZone}</b> – bus įrašyta į pastabą
              </p>
            )}
            {form.dimCheck && (
              <p className={cn(
                'rounded-md px-2 py-1.5 text-[11px]',
                form.dimCheck.ok
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
              )}>
                {form.dimCheck.ok
                  ? `✓ Sutampa su matmenų grandine: ${form.dimCheck.dimMm} mm`
                  : `⚠ Artimiausia grandinė: ${form.dimCheck.dimMm} mm – išmatuota kitaip, patikrinkite mastelį arba taškus`}
              </p>
            )}
            {form.kind === 'length' && (
              <label className="block text-xs">
                Aukštis (m) – sienoms
                <input value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })}
                  inputMode="decimal" className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
              </label>
            )}
            {form.kind === 'area' && form.category === 'room' && (
              <div className="rounded-md border border-violet-200 bg-violet-50 p-2.5 dark:border-violet-900 dark:bg-violet-950">
                <label className="flex items-center gap-2 text-xs font-medium text-violet-900 dark:text-violet-200">
                  <input
                    type="checkbox"
                    checked={form.genFinishes !== false}
                    onChange={(e) => setForm({ ...form, genFinishes: e.target.checked })}
                  />
                  Generuoti apdailos pozicijas (grindys, lubos, sienos)
                </label>
                {form.genFinishes !== false && (
                  <div className="mt-2 flex items-center gap-3">
                    <label className="text-xs text-violet-900 dark:text-violet-200">
                      Aukštis (m)
                      <input
                        value={form.roomHeight ?? '2.7'}
                        onChange={(e) => setForm({ ...form, roomHeight: e.target.value })}
                        inputMode="decimal"
                        className="ml-1.5 h-7 w-16 rounded-md border bg-background px-1.5 text-xs"
                      />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-violet-900 dark:text-violet-200">
                      <input
                        type="checkbox"
                        checked={form.deductOpenings !== false}
                        onChange={(e) => setForm({ ...form, deductOpenings: e.target.checked })}
                      />
                      Atimti angas (≥0,5 m²)
                    </label>
                  </div>
                )}
              </div>
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
