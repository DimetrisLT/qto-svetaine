import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Ruler, Spline, Pentagon, Hash, Trash2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Check, X, ScanText, ClipboardPlus, Layers, Eye, EyeOff, ScanSearch, Sparkles, Wand2, Route, RectangleHorizontal, Scissors } from 'lucide-react';
import { CATEGORY_INFO, CATEGORY_ORDER, categoryLabel, uid, type ElementCategory, type QtoItem } from '@/types/qto';
import { dist, polygonArea, polylineLength, netDeductArea, type Pt } from '@/lib/pdf/measure';
import { fmt, fmtQty, round, uLabel } from '@/lib/format';
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
import { wandArea, traceLine } from '@/lib/pdf/wand';
import { rasterWand } from '@/lib/pdf/rasterWand';
import { detectAxes, snapToAxes, axisZone, type AxisGrid } from '@/lib/pdf/axes';
import { buildRoomFinishItems } from '@/lib/pdf/roomFinishes';
import { grayscaleFromCanvas, matchTemplate, cropGray, binarizeDilate } from '@/lib/ocr/templateMatch';
import { useI18n } from '@/i18n/I18nContext';
import { L } from '@/i18n/store';
import { toMeters as inputToMeters, useUnitSystem } from '@/lib/units';

// Dev serveryje node_modules gali būti už root ribų (symlink) – worker'į tiekiame iš public/
pdfjsLib.GlobalWorkerOptions.workerSrc = import.meta.env.DEV
  ? '/pdf.worker.min.mjs'
  : new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

type Tool = 'none' | 'calib' | 'length' | 'area' | 'count' | 'scan' | 'match' | 'wand' | 'line' | 'rect';

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

/** pdf.js teksto sluoksnis → eilutės (grupuoja pagal Y, rikiuoja pagal X) */
function textContentToLines(tc: { items: unknown[] }): string {
  const words = (tc.items as Array<{ str?: string; transform?: number[] }>)
    .filter((it) => it.str && it.str.trim() && it.transform)
    .map((it) => ({ x: it.transform![4], y: it.transform![5], str: it.str!.trim() }));
  words.sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Array<{ y: number; parts: typeof words }> = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(w.y - last.y) <= 3) last.parts.push(w);
    else lines.push({ y: w.y, parts: [w] });
  }
  return lines.map((l) => l.parts.sort((a, b) => a.x - b.x).map((w) => w.str).join(' ')).join('\n');
}

interface Props {
  fileId: string;
  file: File;
  discipline: string;
  unitsPerMeter: number | null;
  onCalibrate: (upm: number | null, scope?: 'page' | 'all') => void;
  /** Pranešama, kai vartotojas pereina į kitą puslapį (per-page masteliui) */
  onPageChange?: (page: number) => void;
  /** Automatiškai aptiktas mastelis (vieną kartą, pirmas sėkmingas) */
  onDetectScale?: (upm: number | null) => void;
  items: QtoItem[];
  onItemsChange: (items: QtoItem[]) => void;
  /** „Rodyti brėžinyje“: puslapis + taškai, kuriuos reikia paryškinti */
  locate?: { pdfPage: number; points: Pt[]; ts: number } | null;
}

export default function PdfViewer({ fileId, file, discipline, unitsPerMeter, onCalibrate, onPageChange, onDetectScale, items, onItemsChange, locate = null }: Props) {
  const { t, locale } = useI18n();
  const units = useUnitSystem();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  // Puslapių apimtis (dideliems failams – kad neapkrauti programos nereikalingomis analizėmis)
  const [pageRange, setPageRange] = useState<{ lo: number; hi: number } | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeLo, setRangeLo] = useState('1');
  const [rangeHi, setRangeHi] = useState('1');
  const [zoom, setZoom] = useState(1.6);
  const zoomRef = useRef(1.6);
  zoomRef.current = zoom;
  const spaceRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const [hoverPdf, setHoverPdf] = useState<Pt | null>(null);
  const [tool, setTool] = useState<Tool>('none');
  const [current, setCurrent] = useState<Pt[]>([]);
  const [calibPts, setCalibPts] = useState<Pt[]>([]);
  const [calibInput, setCalibInput] = useState('');
  const [form, setForm] = useState<PendingForm | null>(null);
  // Atėmimai (cut-out, Kreo stilius): angų poligonai, atimami iš atidarytos ploto formos
  const [cutting, setCutting] = useState(false);
  const [cutPts, setCutPts] = useState<Pt[]>([]);
  const [deducts, setDeducts] = useState<Pt[][]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [scanRect, setScanRect] = useState<ScanRect | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const autoCancelRef = useRef(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [autoScope, setAutoScope] = useState<'page' | 'range'>('page');
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
  // „Rodyti brėžinyje“ pulsuojantis paryškinimas
  const [locatePulse, setLocatePulse] = useState<Pt[] | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Lietimo gestų būsena: pinch (2 pirštai) arba pan (1 piršto vilkimas; bakstelėjimas = taškas)
  const touchRef = useRef<{
    mode: 'pinch' | 'pan' | 'maybe-pan' | null;
    d0: number; z0: number; mx: number; my: number; // pinch: pradinis atstumas, zoom, vidurio taškas
    px: number; py: number; // pan: paskutinė piršto pozicija
    sx: number; sy: number; // maybe-pan: pradinė pozicija (slenkstis 10 px)
  }>({ mode: null, d0: 0, z0: 1, mx: 0, my: 0, px: 0, py: 0, sx: 0, sy: 0 });
  const swallowClickRef = useRef(false); // po pan-vilkimo sintetinį click ignoruojame

  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      touchRef.current = {
        mode: 'pinch',
        d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        z0: zoom,
        mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2,
        px: 0, py: 0, sx: 0, sy: 0,
      };
    } else if (e.touches.length === 1) {
      // Bet koks įrankis: vilkimas >10 px = ekrano stumdymas, trumpas bakstelėjimas = taškas
      const t0 = e.touches[0];
      touchRef.current = { mode: tool === 'none' ? 'pan' : 'maybe-pan', d0: 0, z0: zoom, mx: 0, my: 0, px: t0.clientX, py: t0.clientY, sx: t0.clientX, sy: t0.clientY };
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    const g = touchRef.current;
    const sc = scrollRef.current;
    if (g.mode === 'pinch' && e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (g.d0 > 0) setZoom(Math.min(4, Math.max(0.5, g.z0 * (d / g.d0))));
      if (sc) { // vidurio taško judesys – slenka konteinerį
        const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
        sc.scrollLeft -= mx - g.mx; sc.scrollTop -= my - g.my;
        g.mx = mx; g.my = my;
      }
    } else if ((g.mode === 'pan' || g.mode === 'maybe-pan') && e.touches.length === 1 && sc) {
      const t0 = e.touches[0];
      if (g.mode === 'maybe-pan') {
        if (Math.hypot(t0.clientX - g.sx, t0.clientY - g.sy) < 10) return; // dar bakstelėjimas
        g.mode = 'pan';
        swallowClickRef.current = true;
      }
      sc.scrollLeft -= t0.clientX - g.px; sc.scrollTop -= t0.clientY - g.py;
      g.px = t0.clientX; g.py = t0.clientY;
    }
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const g = touchRef.current;
    if (g.mode === 'maybe-pan' && e.changedTouches.length === 1) {
      // Pirštas nepajudėjo >10 px – tai bakstelėjimas (taško statymas)
      const t0 = e.changedTouches[0];
      tapCore(t0.clientX, t0.clientY);
    }
    touchRef.current.mode = null;
  };

  // Native (nepasyvūs) lietimo klausytojai: React root listeneriai yra passive,
  // todėl preventDefault neveikia ir kompozitorius „atšoka“ programiškai slinktą poziciją.
  const touchHandlersRef = useRef({ start: handleTouchStart, move: handleTouchMove, end: handleTouchEnd });
  touchHandlersRef.current = { start: handleTouchStart, move: handleTouchMove, end: handleTouchEnd };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => { e.preventDefault(); touchHandlersRef.current.start(e); };
    const onMove = (e: TouchEvent) => { e.preventDefault(); touchHandlersRef.current.move(e); };
    const onEnd = (e: TouchEvent) => { e.preventDefault(); touchHandlersRef.current.end(e); };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  });

  useEffect(() => { onPageChange?.(pageNum); }, [pageNum]); // eslint-disable-line react-hooks/exhaustive-deps

  const rangeLoBound = pageRange?.lo ?? 1;
  const rangeHiBound = pageRange?.hi ?? numPages;
  const applyRange = (l: number, h: number | null) => {
    const nLo = Math.max(1, Math.min(l, numPages));
    const nHi = h === null ? numPages : Math.max(nLo, Math.min(h, numPages));
    setPageRange(nLo === 1 && nHi === numPages ? null : { lo: nLo, hi: nHi });
    if (pageNum < nLo) setPageNum(nLo);
    if (pageNum > nHi) setPageNum(nHi);
    setRangeOpen(false);
  };

  // Pakeitus puslapį – uždaryti nebaigtą matavimą/formą (niekas „nenuklysta“ į kitą puslapį)
  useEffect(() => {
    setForm(null);
    setCurrent([]);
    setCalibPts([]);
    setCutting(false);
    setCutPts([]);
    setDeducts([]);
    setScanError(null);
    // Simbolių paieškos rezultatai priklauso tik tam puslapiui
    setMatchResults(null);
    setMatchThumb(null);
    setMatchError(null);
  }, [pageNum]);

  const calibrated = unitsPerMeter !== null && unitsPerMeter > 0;
  const toMeters = useCallback((u: number) => (calibrated ? u / unitsPerMeter! : undefined), [calibrated, unitsPerMeter]);

  // PDF figūros išvedamos iš kiekių eilučių (vienintelis tiesos šaltinis – tėvinis state)
  const shapes = useMemo(
    () => items.filter((i) => i.pdfPoints && i.pdfPage === pageNum && (!i.pdfFile || i.pdfFile === fileId)),
    [items, pageNum, fileId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    file.arrayBuffer().then((buf) => pdfjsLib.getDocument({ data: buf }).promise)
      .then(async (doc) => {
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
        setPageRange(null);
        if (doc.numPages > 5) {
          setRangeLo('1');
          setRangeHi(String(doc.numPages));
          setRangeOpen(true);
        }
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
      .catch(() => setLoadError(t.pdf.openError));
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

  const toPdfPt = (e: { clientX: number; clientY: number }): Pt => {
    const rect = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  };

  // „Rodyti brėžinyje“: perjungiame puslapį, priartiname prie figūros ir paryškiname
  useEffect(() => {
    if (!locate || !pdf) return;
    setPageNum(locate.pdfPage);
    setLocatePulse(locate.points);
    const xs = locate.points.map((p) => p.x);
    const ys = locate.points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const bw = Math.max(30, maxX - minX), bh = Math.max(30, maxY - minY);
    let scroll: ReturnType<typeof setTimeout> | undefined;
    const fit = setTimeout(() => {
      const scroller = wrapRef.current?.parentElement;
      if (!scroller) return;
      const z = Math.min(3.5, Math.max(0.5,
        0.75 * Math.min(scroller.clientWidth / bw, scroller.clientHeight / bh)));
      setZoom(z);
      scroll = setTimeout(() => {
        scroller.scrollLeft = (minX + bw / 2) * z - scroller.clientWidth / 2;
        scroller.scrollTop = (minY + bh / 2) * z - scroller.clientHeight / 2;
      }, 150);
    }, 600);
    const clear = setTimeout(() => setLocatePulse(null), 7000);
    return () => { clearTimeout(fit); if (scroll) clearTimeout(scroll); clearTimeout(clear); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locate?.ts, pdf]);

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

  // Klaviatūros spartieji (Bluebeam stilius): Enter – baigti, Backspace – paskutinis taškas, Esc – atšaukti, +/- – mastytis, Space – stumdymas
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { spaceRef.current = true; return; }
      if (e.defaultPrevented) return; // jau apdorota React formos handlerio
      if (typing()) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (form) { if (cutting && cutPts.length >= 3) finishCutting(); else saveForm(); }
        else finishCurrent();
      }
      else if (e.key === 'Escape') {
        if (cutting) { setCutting(false); setCutPts([]); }
        else if (form) { setForm(null); setDeducts([]); }
        else if (current.length) setCurrent([]);
        else if (calibPts.length) setCalibPts([]);
        else if (tool !== 'none') setTool('none');
      } else if (e.key === 'Backspace') {
        if (cutting && cutPts.length) { e.preventDefault(); setCutPts((c) => c.slice(0, -1)); }
        else if (current.length) { e.preventDefault(); setCurrent((c) => c.slice(0, -1)); }
        else if (calibPts.length) { e.preventDefault(); setCalibPts((c) => c.slice(0, -1)); }
      } else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z + 0.25));
      else if (e.key === '-') setZoom((z) => Math.max(0.5, z - 0.25));
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === ' ') spaceRef.current = false; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp); };
  });

  // Ratukas – mastytis ties kursoriumi (CAD/Bluebeam įprotis)
  useEffect(() => {
    const scroller = wrapRef.current?.parentElement;
    if (!scroller || !pdf) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sRect = scroller.getBoundingClientRect();
      const pdfX = (e.clientX - sRect.left + scroller.scrollLeft) / zoomRef.current;
      const pdfY = (e.clientY - sRect.top + scroller.scrollTop) / zoomRef.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const nz = Math.min(4, Math.max(0.5, zoomRef.current * factor));
      setZoom(nz);
      requestAnimationFrame(() => {
        scroller.scrollLeft = pdfX * nz - (e.clientX - sRect.left);
        scroller.scrollTop = pdfY * nz - (e.clientY - sRect.top);
      });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [pdf]);

  const toggleLayer = (id: string, visible: boolean) => {
    try { ocgConfigRef.current?.setVisibility(id, visible); } catch { /* ignore */ }
    setLayers((ls) => ls.map((l) => (l.id === id ? { ...l, visible } : l)));
    setLayerTick((t) => t + 1);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (swallowClickRef.current) { swallowClickRef.current = false; return; } // buvo pan-vilkimas, ne bakstelėjimas
    clickCore(e.clientX, e.clientY);
  };

  // Bakstelėjimas lietimu (touchend po nepajudinto piršto) – ta pati logika kaip click
  const tapCore = (x: number, y: number) => clickCore(x, y);

  const clickCore = (clientX: number, clientY: number) => {
    const e = { clientX, clientY };
    if (tool === 'none' || tool === 'scan' || tool === 'match') return;
    // Atėmimo taškų rinkimas, kol atidaryta ploto forma (cut-out režimas)
    if (form) {
      if (cutting && form.kind === 'area') setCutPts((c) => [...c, snapRef.current ?? toPdfPt(e)]);
      return;
    }
    if (tool === 'calib') {
      const p = snapRef.current ?? toPdfPt(e);
      const next = [...calibPts, p].slice(-2);
      setCalibPts(next);
      return;
    }
    // Kreo „1-klik plotas“: spustelėjimas patalpoje → automatinis kontūras iš vektorių.
    // Čia naudojamas NEAPDIRBTAS taškas (be prisirišimo) – burtas turi patekti į patalpos vidų.
    if (tool === 'wand') {
      const p = toPdfPt(e);
      const segs = segsDataRef.current;
      if (!segs || segs.count === 0) { setScanError(t.pdf.wandNoVector); return; }
      // Pirmiausia rastrinis flood-fill (visada grąžina sritį, kurioje TIKRAI yra p –
      // kaip Kreo CV); jam nepavykus – tikslusis vektorinis grafo sekimas.
      let pts: Pt[] | null = null;
      const ps = pageSizeRef.current;
      if (ps) pts = rasterWand(segs, p, ps.w, ps.h);
      if (!pts) pts = wandArea(segs, p);
      if (pts && pts.length >= 3) { setScanError(null); openForm('area', pts); }
      else setScanError(t.pdf.wandFail);
      return;
    }
    // Kreo „1-klik linija“: spustelėjimas ant linijos → nusekamas jos kelias.
    if (tool === 'line') {
      const p = toPdfPt(e);
      const segs = segsDataRef.current;
      if (!segs || segs.count === 0) { setScanError(t.pdf.wandNoVector); return; }
      const pts = traceLine(segs, p);
      if (pts && pts.length >= 2) { setScanError(null); openForm('length', pts); }
      else setScanError(t.pdf.lineFail);
      return;
    }
    // Stačiakampis iš 2 taškų (Kreo Rectangle) – iškart atidaroma forma.
    if (tool === 'rect') {
      const p = snapRef.current ?? toPdfPt(e);
      const next = [...current, p].slice(-2);
      if (next.length === 2) {
        const [a, b] = next;
        // Apsauga nuo nulinio stačiakampio (pvz., dvigubas klikas pradedant)
        if (Math.abs(b.x - a.x) < 1 || Math.abs(b.y - a.y) < 1) { setCurrent([a]); return; }
        setCurrent([]);
        openForm('area', [
          { x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y },
        ]);
      } else {
        setCurrent(next);
      }
      return;
    }
    const p = snapRef.current ?? toPdfPt(e);
    setCurrent((c) => [...c, p]);
  };

  const finishCurrent = (ptsArg?: Pt[]) => {
    const pts = ptsArg ?? current;
    if (tool === 'length' && pts.length >= 2) openForm('length', pts);
    else if (tool === 'area' && pts.length >= 3) openForm('area', pts);
    else if (tool === 'count' && pts.length >= 1) openForm('count', pts);
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
      name: suggested ?? `${categoryLabel(defCat)} (${t.pdf.pageShort}${pageNum})`,
      height: kind === 'length' ? (units === 'imperial' ? '10' : '3') : '',
      thickness: '',
      perArea: '', perVolume: '',
      material: '',
      nameSuggested: suggested !== null,
      dimCheck,
      axesZone: axesZoneVal,
      genFinishes: kind === 'area',
      roomHeight: units === 'imperial' ? '9' : '2.7',
      deductOpenings: true,
    });
    setCurrent([]);
    setCutting(false);
    setCutPts([]);
    setDeducts([]);
  };

  // Užbaigti einamąjį atėmimo poligoną (Kreo cut-out) – forma lieka atidaryta,
  // galima pridėti kelis atėmimus iš eilės.
  const finishCutting = () => {
    if (cutPts.length >= 3) setDeducts((d) => [...d, cutPts]);
    setCutPts([]);
    setCutting(false); // užbaigus angą išėjame iš režimo – kitą angą pradedame nauju paspaudimu
  };

  const saveForm = () => {
    if (!form) return;
    // Vartotojo įvestis aktyviais vienetais (m arba ft) – canonical visada metrinė
    const h = inputToMeters(parseFloat(form.height.replace(',', '.')), 'm', units);
    const th = inputToMeters(parseFloat(form.thickness.replace(',', '.')), 'm', units);
    const pa = inputToMeters(parseFloat(form.perArea.replace(',', '.')), 'm²', units);
    const pv = inputToMeters(parseFloat(form.perVolume.replace(',', '.')), 'm³', units);

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
        if (!Number.isNaN(th)) { volume_m3 = round(area_m2 * th, 3); unit = 'm³'; }
      }
    } else if (form.kind === 'area') {
      const u = polygonArea(form.pts);
      const ded = netDeductArea(form.pts, deducts);
      area_m2 = calibrated ? round(Math.max(0, u - ded) / (unitsPerMeter! * unitsPerMeter!), 3) : 0;
      unit = 'm²';
      if (!Number.isNaN(th)) { volume_m3 = round(area_m2 * th, 3); unit = 'm³'; }
      // Perimetras – informatyvu visoms ploto pozicijoms, būtina patalpų apdailai
      length_m = round(toMeters(polylineLength(form.pts, true)) ?? 0, 3);
    } else {
      count = form.pts.length;
      unit = 'vnt.';
      if (!Number.isNaN(pa)) area_m2 = round(pa * count, 3);
      if (!Number.isNaN(pv)) volume_m3 = round(pv * count, 3);
    }

    const cutNote = form.kind === 'area' && deducts.length > 0 && calibrated
      ? `${t.pdf.cutoutNote}: −${fmtQty(netDeductArea(form.pts, deducts) / (unitsPerMeter! * unitsPerMeter!), 'm²', 2, units)} ${uLabel('m²', units)}`
      : null;
    const item: QtoItem = {
      id: uid(),
      source: 'PDF',
      category: form.category,
      name: form.name || `${categoryLabel(form.category)} (${t.pdf.pageShort}${pageNum})`,
      material: form.material || undefined,
      length_m,
      height_m: form.kind === 'length' && !Number.isNaN(h) ? h : undefined,
      thickness_m: !Number.isNaN(th) ? th : undefined,
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
        !calibrated ? t.pdf.notCalibrated : null,
        form.axesZone ? `${L({ lt: 'Ašys', en: 'Grid' })}: ${form.axesZone}` : null,
        cutNote,
      ].filter(Boolean).join('; ') || undefined,
    };
    // Patalpos apdaila: grindys + lubos + sienos (su angų atėmimu)
    let extra: QtoItem[] = [];
    if (form.kind === 'area' && form.category === 'room' && form.genFinishes) {
      const h = inputToMeters(parseFloat((form.roomHeight ?? '').replace(',', '.')), 'm', units);
      extra = buildRoomFinishItems(item, items, {
        heightM: Number.isNaN(h) ? 2.7 : h,
        deductOpenings: form.deductOpenings !== false,
        openingThresholdM2: 0.5,
      });
    }
    onItemsChange([...items, item, ...extra]);
    setForm(null);
    setCutting(false);
    setCutPts([]);
    setDeducts([]);
  };

  const removeItem = (id: string) => {
    onItemsChange(items.filter((i) => i.id !== id));
  };

  const applyCalibration = (scope: 'page' | 'all') => {
    const real = inputToMeters(parseFloat(calibInput.replace(',', '.')), 'm', units);
    if (calibPts.length === 2 && real > 0) {
      const upm = dist(calibPts[0], calibPts[1]) / real;
      if (scaleSuggestion) {
        const dev = deviationPct(upm, scaleSuggestion.unitsPerMeter);
        setCalibDeviation(dev > 2 ? dev : null);
      }
      onCalibrate(upm, scope);
      setTool('none');
      setCalibPts([]);
      setCalibInput('');
    }
  };

  const resetCalibration = () => {
    onCalibrate(null, 'all');
    setCalibPts([]);
    setCalibInput('');
  };

  // --- Žiniaraščio skaitymas (OCR) ---
  const handleMouseDown = (e: React.PointerEvent) => {
    // Stumdymas: vidurinis mygtukas arba Space (Bluebeam/PlanSwift įprotis)
    if (e.button === 1 || spaceRef.current) {
      const scroller = wrapRef.current?.parentElement;
      if (scroller) {
        e.preventDefault();
        panRef.current = { x: e.clientX, y: e.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop };
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      return;
    }
    if ((tool !== 'scan' && tool !== 'match') || reviewRows || scanning || matchResults) return;
    // Lietimo gestams – užfiksuojame pointer'į, kad tempimas nenutrūktų
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = toPdfPt(e);
    setScanRect({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const handleMouseMove = (e: React.PointerEvent) => {
    // Stumdymas viduriniu mygtuku arba Space (kaip Bluebeam/PlanSwift)
    if (panRef.current) {
      const scroller = wrapRef.current?.parentElement;
      if (scroller) {
        scroller.scrollLeft = panRef.current.sl - (e.clientX - panRef.current.x);
        scroller.scrollTop = panRef.current.st - (e.clientY - panRef.current.y);
      }
      return;
    }
    if (tool === 'scan' || tool === 'match') {
      if (!scanRect || e.buttons !== 1) return;
      const p = toPdfPt(e);
      setScanRect({ ...scanRect, x1: p.x, y1: p.y });
      return;
    }
    // Prisirišimas (snapping) matavimo įrankiams: pirmiausia ašių sankirtos, po to vektoriai
    if (tool === 'none') { setHoverPdf(null); return; }
    if (form && !cutting) { setHoverPdf(null); return; }
    const p = toPdfPt(e);
    // „1-klik“ įrankiams prisirišimas netaikomas – burtas turi pataikyti į tikrąją vietą
    if (tool === 'wand' || tool === 'line') {
      snapRef.current = null;
      setHoverPdf(p);
      return;
    }
    const ax = snapToAxes(getAxes(), p, 12 / zoom);
    const next = ax ?? snapIndexRef.current?.snap(p, 9 / zoom)?.p ?? null;
    snapRef.current = next;
    setHoverPdf(next ?? p);
    const prev = snapPrevRef.current;
    const changed = (next === null) !== (prev === null)
      || (next && prev && (Math.abs(next.x - prev.x) > 0.5 || Math.abs(next.y - prev.y) > 0.5));
    if (changed) {
      snapPrevRef.current = next;
      setSnapIndicator(next);
    }
  };

  const handleMouseUp = () => {
    panRef.current = null;
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
        setMatchError(t.pdf.symTooBig);
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
        setMatchError(t.pdf.symNone);
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
      setMatchError(t.pdf.symFail);
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
        setScanError(t.pdf.ocrNone);
      } else {
        visoRef.current = extractVisoTotals(text);
        setReviewRows(rows);
        setReviewTitle(L({ lt: `Nuskaityta iš p.${pageNum} – aptikta ${rows.length} poz.`, en: `Scanned from p.${pageNum} – ${rows.length} rows found` }));
      }
    } catch (err) {
      console.error(err);
      setScanError(t.pdf.ocrFail);
    } finally {
      setScanning(false);
    }
  };

  /** Automatinė žiniaraščių paieška visame pasirinktame puslapių diapazone */
  const runAutoScan = async () => {
    if (!pdf) return;
    autoCancelRef.current = false;
    setScanning(true);
    setScanError(null);
    const scanLo = autoScope === 'page' ? pageNum : rangeLoBound;
    const scanHi = autoScope === 'page' ? pageNum : rangeHiBound;
    const total = scanHi - scanLo + 1;
    setScanProgress({ done: 0, total });
    const found: ScannedRow[] = [];
    let pagesWithRows = 0;
    try {
      for (let p = scanLo; p <= scanHi; p++) {
        if (autoCancelRef.current) break;
        const page = await pdf.getPage(p);
        let text = '';
        try { text = textContentToLines(await page.getTextContent()); } catch { /* nėra teksto sluoksnio */ }
        let rows = parseScheduleText(text);
        if (rows.length < 2 && text.length < 80) {
          // Skenuotas puslapis be teksto sluoksnio – pilnas OCR
          const scale = 2;
          const c = document.createElement('canvas');
          const vp = page.getViewport({ scale });
          c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
          const cctx = c.getContext('2d')!;
          cctx.fillStyle = '#fff'; cctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvas: c, canvasContext: cctx, viewport: vp }).promise;
          rows = parseScheduleText(await ocrCanvas(c));
        }
        if (rows.length >= 2) {
          pagesWithRows++;
          for (const r of rows) r.page = p;
          found.push(...rows);
        }
        setScanProgress({ done: p - scanLo + 1, total });
      }
      if (found.length === 0) {
        setScanError(t.pdf.autoNone);
      } else {
        visoRef.current = undefined;
        setReviewRows(found);
        setReviewTitle(L({
          lt: `Auto paieška: ${found.length} poz. iš ${pagesWithRows} psl. – patikrinkite prieš įtraukdami`,
          en: `Auto scan: ${found.length} rows from ${pagesWithRows} pages – review before importing`,
        }));
      }
    } catch (err) {
      console.error(err);
      setScanError(t.pdf.ocrFail);
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  };

  const openManualEntry = () => {
    setScanError(null);
    setReviewRows([]);
    setReviewTitle(t.pdf.manualTitle);
  };

  const saveReview = (rows: ScannedRow[]) => {
    // Auto nuskaitymas: eilutės gali būti iš skirtingų puslapių – grupuojame
    const byPage = new Map<number, ScannedRow[]>();
    for (const r of rows) {
      const p = r.page ?? pageNum;
      byPage.set(p, [...(byPage.get(p) ?? []), r]);
    }
    const newItems: QtoItem[] = [];
    for (const [p, rs] of byPage) {
      newItems.push(...rowsToItems(rs, { fileId, fileName: file.name, discipline, page: p }, visoRef.current));
    }
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
    if ((t === 'length' || t === 'area' || t === 'wand' || t === 'line' || t === 'rect') && !calibrated) {
      setTool('calib');
      setCurrent([]);
      return;
    }
    setTool(tool === t ? 'none' : t);
    setCurrent([]);
    setScanError(null);
  };

  const toolBtn = (t: Tool, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => pickTool(t)}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
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
        {kind !== 'area' && kind !== 'count' && pts.length >= 2 && (
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
      <div className="min-w-0">
        {/* Įrankių juosta: mobiliajame slenkama horizontaliai */}
        <div className="mb-2 flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible md:pb-0">
          {toolBtn('calib', <Ruler className="h-3.5 w-3.5" />, t.pdf.tools.calib)}
          {toolBtn('length', <Spline className="h-3.5 w-3.5" />, t.pdf.tools.length)}
          {toolBtn('area', <Pentagon className="h-3.5 w-3.5" />, t.pdf.tools.area)}
          {toolBtn('wand', <Wand2 className="h-3.5 w-3.5" />, t.pdf.tools.wand)}
          {toolBtn('line', <Route className="h-3.5 w-3.5" />, t.pdf.tools.line)}
          {toolBtn('rect', <RectangleHorizontal className="h-3.5 w-3.5" />, t.pdf.tools.rect)}
          {toolBtn('count', <Hash className="h-3.5 w-3.5" />, t.pdf.tools.count)}
          {toolBtn('match', <ScanSearch className="h-3.5 w-3.5" />, t.pdf.tools.match)}
          {toolBtn('scan', <ScanText className="h-3.5 w-3.5" />, t.pdf.tools.scan)}
          <button
            onClick={() => void runAutoScan()}
            disabled={scanning}
            title={t.pdf.autoHint}
            className="flex shrink-0 items-center gap-1.5 rounded-l-lg border border-primary/60 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />{t.pdf.tools.auto}
          </button>
          <select
            value={autoScope}
            onChange={(e) => setAutoScope(e.target.value as 'page' | 'range')}
            title={t.pdf.autoScopeHint}
            className="-ml-2 shrink-0 rounded-r-lg border border-l-0 border-primary/60 bg-primary/10 px-1.5 py-2 text-xs font-semibold text-primary"
          >
            <option value="page">{t.pdf.autoScopePage} {pageNum}</option>
            <option value="range">{t.pdf.autoScopeRange} {rangeLoBound}–{rangeHiBound}</option>
          </select>
          <span className="mx-1 h-5 w-px bg-border" />
          <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="shrink-0 rounded-lg border p-2 hover:bg-muted"><ZoomOut className="h-3.5 w-3.5" /></button>
          <button onClick={() => setZoom((z) => Math.min(4, z + 0.25))} className="shrink-0 rounded-lg border p-2 hover:bg-muted"><ZoomIn className="h-3.5 w-3.5" /></button>
          <span className="mx-1 h-5 w-px bg-border" />
          <button disabled={pageNum <= rangeLoBound} onClick={() => setPageNum((p) => Math.max(rangeLoBound, p - 1))} className="shrink-0 rounded-lg border p-2 hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="flex items-center gap-1 text-xs tabular-nums">
            <input
              key={pageNum}
              defaultValue={pageNum}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = parseInt((e.target as HTMLInputElement).value, 10);
                  if (n >= rangeLoBound && n <= rangeHiBound) setPageNum(n);
                }
              }}
              onBlur={(e) => {
                const n = parseInt(e.target.value, 10);
                if (n >= rangeLoBound && n <= rangeHiBound && n !== pageNum) setPageNum(n);
              }}
              className="h-7 w-11 rounded-md border bg-background px-1 text-center text-xs"
              title={t.pdf.pageNum}
            />
            / {numPages}
          </span>
          <button disabled={pageNum >= rangeHiBound} onClick={() => setPageNum((p) => Math.min(rangeHiBound, p + 1))} className="shrink-0 rounded-lg border p-2 hover:bg-muted disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
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
                <Layers className="h-3.5 w-3.5" /> {t.pdf.layers} ({layers.filter((l) => l.visible).length}/{layers.length})
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
            <button onClick={() => finishCurrent()} title="Enter" className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
              <Check className="h-3.5 w-3.5" /> {t.pdf.finish} ({current.length})
            </button>
            <button onClick={() => setCurrent([])} className="flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">
              <X className="h-3.5 w-3.5" /> {t.pdf.clear}
            </button>
          </span>
        </div>

        {!calibrated && scaleSuggestion && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <span>
              {t.pdf.detected} <b>{scaleSuggestion.paperName}</b> {t.pdf.sheetWord} <b>1:{scaleSuggestion.scale}</b>.
            </span>
            <button
              onClick={() => { onCalibrate(scaleSuggestion.unitsPerMeter, 'page'); setCalibDeviation(null); }}
              className="rounded-md bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-700"
            >
              {t.pdf.applyScale}
            </button>
            <span className="text-emerald-800/70 dark:text-emerald-300/70">{t.pdf.calibManual}</span>
          </div>
        )}
        {!calibrated && !scaleSuggestion && (dimScale || ocrScale) && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200">
            {ocrScale ? (
              <span>{t.pdf.scaleFromScan} <b>1:{ocrScale.scale}</b> ({ocrScale.paperName}, OCR).</span>
            ) : dimScale && (
              <span>
                {t.pdf.dimScale} <b>~1:{Math.round((72 / 25.4 * 1000) / dimScale.unitsPerMeter)}</b>
                {' '}({dimScale.evidence} {t.pdf.dimScaleOf} {dimScale.sample}).
              </span>
            )}
            <button
              onClick={() => { onCalibrate(ocrScale ? ocrScale.unitsPerMeter : dimScale!.unitsPerMeter, 'page'); setCalibDeviation(null); }}
              className="rounded-md bg-sky-600 px-2.5 py-1 font-semibold text-white hover:bg-sky-700"
            >
              {t.pdf.applyScale}
            </button>
            <span className="text-sky-800/70 dark:text-sky-300/70">{t.pdf.calibCheck}</span>
          </div>
        )}
        {!calibrated && !scaleSuggestion && (
          <div className="mb-2 space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <p>{t.pdf.calibWarn}</p>
            {paperOnlyName && (
              <p className="flex flex-wrap items-center gap-1.5">
                <span>{t.pdf.similarTo} <b>{paperOnlyName}</b>. {t.pdf.approxScale}</span>
                {[50, 100, 200].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      const upm = unitsPerMeterFor(viewSize.w / zoom, viewSize.h / zoom, s);
                      if (upm) onCalibrate(upm, 'page');
                    }}
                    className="rounded-md border border-amber-400 bg-white/60 px-2 py-0.5 font-semibold hover:bg-amber-100 dark:bg-transparent"
                  >
                    1:{s}
                  </button>
                ))}
                <span className="text-amber-800/70 dark:text-amber-300/70">{t.pdf.calibFitNote}</span>
              </p>
            )}
          </div>
        )}
        {calibrated && calibDeviation !== null && scaleSuggestion && (
          <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {t.pdf.devA} {fmt(calibDeviation, 1)} % {t.pdf.devB} 1:{scaleSuggestion.scale} ({scaleSuggestion.paperName}). {t.pdf.devCheck}{' '}
            <button
              onClick={() => { onCalibrate(scaleSuggestion.unitsPerMeter, 'page'); setCalibDeviation(null); }}
              className="font-semibold underline"
            >
              {t.pdf.devApply}
            </button>.
          </p>
        )}

        {/* Puslapių apimties pasirinkimas (dideliems failams) */}
        {rangeOpen && numPages > 1 && (
          <div className="mb-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
            <p className="font-medium">{t.pdf.pagesTitle} <span className="font-normal text-indigo-800/70 dark:text-indigo-300/70">({numPages})</span></p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1">{t.pdf.pagesFrom}
                <input value={rangeLo} onChange={(e) => setRangeLo(e.target.value)} inputMode="numeric"
                  className="h-8 w-16 rounded-md border bg-background px-2 text-center" />
              </label>
              <label className="flex items-center gap-1">{t.pdf.pagesTo}
                <input value={rangeHi} onChange={(e) => setRangeHi(e.target.value)} inputMode="numeric"
                  className="h-8 w-16 rounded-md border bg-background px-2 text-center" />
              </label>
              <button
                onClick={() => applyRange(parseInt(rangeLo, 10) || 1, parseInt(rangeHi, 10) || numPages)}
                className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
              >{t.pdf.pagesApply}</button>
              <button onClick={() => applyRange(1, null)} className="rounded-md border px-3 py-1.5 hover:bg-muted">{t.pdf.pagesAll}</button>
            </div>
          </div>
        )}

        {/* Brėžinys + perdanga */}
        <div ref={scrollRef} className="max-h-[55vh] overflow-auto rounded-xl border bg-slate-100 dark:bg-slate-900 md:max-h-[640px]">
          <div
            ref={wrapRef}
            className="relative inline-block cursor-crosshair touch-none"
            onClick={handleClick}
            onDoubleClick={(e) => {
              if (cutting && cutPts.length >= 3) {
                e.preventDefault();
                finishCutting();
                return;
              }
              if (current.length >= 1 && tool !== 'calib' && tool !== 'wand' && tool !== 'line') {
                e.preventDefault();
                // dvigubo kliko metu paskutiniai du taškai sutampa – nuimame dublikatą ir baigiame
                let pts = current;
                const n = pts.length;
                if (n >= 2 && Math.hypot(pts[n - 1].x - pts[n - 2].x, pts[n - 1].y - pts[n - 2].y) < 1) pts = pts.slice(0, -1);
                finishCurrent(pts);
              }
            }}
            onContextMenu={(e) => {
              if (cutting && cutPts.length) {
                e.preventDefault();
                setCutPts((c) => c.slice(0, -1));
              } else if (current.length || calibPts.length) {
                e.preventDefault();
                if (current.length) setCurrent((c) => c.slice(0, -1));
                else setCalibPts((c) => c.slice(0, -1));
              }
            }}
            onPointerDown={handleMouseDown}
            onPointerMove={handleMouseMove}
            onPointerUp={handleMouseUp}
          >
            <canvas ref={canvasRef} className="block" />
            <svg width={viewSize.w} height={viewSize.h} className="absolute left-0 top-0">
              {/* Kalibravimo atkarpa */}
              {calibPts.length > 0 && renderShape(calibPts, '#f97316', 'calib', 'length',
                calibPts.length === 2 && calibrated ? `${fmtQty(dist(calibPts[0], calibPts[1]) / unitsPerMeter!, 'm', 2, units)} ${uLabel('m', units)} (${t.pdf.ref})` : t.pdf.ref)}
              {/* Išsaugotos figūros */}
              {shapes.map((s) => {
                const color = CATEGORY_INFO[s.category].color;
                const label = s.pdfKind === 'length' && s.length_m !== undefined
                  ? `${fmtQty(s.length_m, 'm', 2, units)} ${uLabel('m', units)}`
                  : s.pdfKind === 'area' && s.area_m2 !== undefined
                    ? `${fmtQty(s.area_m2, 'm²', 2, units)} ${uLabel('m²', units)}`
                    : s.pdfKind === 'count' ? `${s.count} ${t.pdf.pcs}` : undefined;
                return renderShape(s.pdfPoints!, color, s.id, s.pdfKind ?? 'length', label);
              })}
              {/* Dabartinė (daroma) figūra */}
              {current.length > 0 && renderShape(current, '#0ea5e9', 'current', tool === 'area' || tool === 'rect' ? 'area' : tool === 'count' ? 'count' : 'length',
                tool === 'length' && liveLength !== undefined ? `${fmtQty(liveLength, 'm', 2, units)} ${uLabel('m', units)}`
                  : (tool === 'area' || tool === 'rect') && liveArea !== undefined ? `${fmtQty(liveArea, 'm²', 2, units)} ${uLabel('m²', units)}`
                  : tool === 'count' ? `${current.length} ${t.pdf.pcs}` : undefined)}
              {/* Atidarytos formos figūra (kad atėmimus būtų galima braižyti kontekste) */}
              {form && form.pts.length >= 2 && renderShape(form.pts, '#0ea5e9', 'form-shape', form.kind)}
              {/* Atėmimai (cut-out): brūkšninis raudonas kontūras */}
              {form?.kind === 'area' && deducts.map((d, i) => (
                <polygon
                  key={`cut${i}`}
                  points={d.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ')}
                  fill="#ef4444" fillOpacity={0.18} stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3"
                />
              ))}
              {cutting && cutPts.length > 0 && (
                <g>
                  <polyline
                    points={cutPts.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ')}
                    fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 3"
                  />
                  {cutPts.map((p, i) => <circle key={i} cx={p.x * zoom} cy={p.y * zoom} r={3.5} fill="#ef4444" />)}
                </g>
              )}
              {/* Prisirišimo (snapping) indikatorius */}
              {snapIndicator && (
                <g pointerEvents="none">
                  <circle cx={snapIndicator.x * zoom} cy={snapIndicator.y * zoom} r={6} fill="none" stroke="#0ea5e9" strokeWidth={2} />
                  <line x1={snapIndicator.x * zoom - 10} y1={snapIndicator.y * zoom} x2={snapIndicator.x * zoom + 10} y2={snapIndicator.y * zoom} stroke="#0ea5e9" strokeWidth={1.5} />
                  <line x1={snapIndicator.x * zoom} y1={snapIndicator.y * zoom - 10} x2={snapIndicator.x * zoom} y2={snapIndicator.y * zoom + 10} stroke="#0ea5e9" strokeWidth={1.5} />
                </g>
              )}
              {/* „Rodyti brėžinyje“ pulsuojantis paryškinimas */}
              {locatePulse && (
                <g pointerEvents="none" className="animate-pulse">
                  {locatePulse.length === 1 && (
                    <circle cx={locatePulse[0].x * zoom} cy={locatePulse[0].y * zoom} r={10} fill="none" stroke="#7c3aed" strokeWidth={3} />
                  )}
                  {locatePulse.length === 2 && (
                    <>
                      <line x1={locatePulse[0].x * zoom} y1={locatePulse[0].y * zoom} x2={locatePulse[1].x * zoom} y2={locatePulse[1].y * zoom} stroke="#7c3aed" strokeWidth={4} strokeLinecap="round" />
                      <circle cx={locatePulse[0].x * zoom} cy={locatePulse[0].y * zoom} r={5} fill="#7c3aed" />
                      <circle cx={locatePulse[1].x * zoom} cy={locatePulse[1].y * zoom} r={5} fill="#7c3aed" />
                    </>
                  )}
                  {locatePulse.length > 2 && (
                    <polygon
                      points={locatePulse.map((p) => `${p.x * zoom},${p.y * zoom}`).join(' ')}
                      fill="#7c3aed" fillOpacity={0.15} stroke="#7c3aed" strokeWidth={3} strokeLinejoin="round"
                    />
                  )}
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
            {/* Tiesioginė ataskaita prie kursoriaus (Bluebeam stilius) */}
            {hoverPdf && !form && current.length > 0 && calibrated && (tool === 'length' || tool === 'area' || tool === 'count' || tool === 'rect') && (
              <div
                className="pointer-events-none absolute z-20 whitespace-nowrap rounded-md bg-slate-900/90 px-2 py-1 text-[11px] font-semibold text-white shadow"
                style={{ left: hoverPdf.x * zoom + 16, top: hoverPdf.y * zoom + 16 }}
              >
                {tool === 'length' && `${fmtQty(polylineLength([...current, hoverPdf], false) / unitsPerMeter!, 'm', 2, units)} ${uLabel('m', units)}`}
                {tool === 'area' && `${fmtQty(polygonArea([...current, hoverPdf]) / (unitsPerMeter! * unitsPerMeter!), 'm²', 2, units)} ${uLabel('m²', units)}`}
                {tool === 'rect' && `${fmtQty(Math.abs((hoverPdf.x - current[0].x) * (hoverPdf.y - current[0].y)) / (unitsPerMeter! * unitsPerMeter!), 'm²', 2, units)} ${uLabel('m²', units)}`}
                {tool === 'count' && `${current.length + 1} ${t.pdf.pcs}`}
              </div>
            )}
          </div>
        {/* Slankiosios valdymo kortelės: kalibravimas + puslapių perjungiklis */}
        <div className="sticky bottom-3 z-30 mx-auto flex w-fit max-w-full flex-col items-center gap-2">
        {tool === 'calib' && (
          <div className="w-80 max-w-[92vw] space-y-2 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
            <p className="text-sm font-semibold">{t.pdf.calibTitle} <span className="text-xs font-normal text-muted-foreground">({t.pdf.pageShort}{pageNum})</span></p>
            <p className="text-xs text-muted-foreground">
              {calibPts.length < 2
                ? `${t.pdf.calibClickA} ${calibPts.length === 0 ? t.pdf.calibFirst : t.pdf.calibSecond} ${t.pdf.calibClickB}`
                : t.pdf.calibEnter}
            </p>
            {calibPts.length === 2 && (
              <>
                <input
                  value={calibInput}
                  onChange={(e) => setCalibInput(e.target.value)}
                  placeholder={locale === 'lt' ? 'pvz., 6.00' : 'e.g., 6.00'}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  inputMode="decimal"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <button onClick={() => applyCalibration('page')} className="flex-1 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted">{t.pdf.applyPage}</button>
                  <button onClick={() => applyCalibration('all')} className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground">{t.pdf.applyAll}</button>
                </div>
              </>
            )}
            {calibrated && (
              <p className="text-xs text-emerald-600">{t.pdf.calibActive} {fmt(unitsPerMeter!, 1)} {t.pdf.upm}</p>
            )}
            {calibrated && (
              <button onClick={resetCalibration} className="text-xs text-muted-foreground underline">{t.pdf.calibReset}</button>
            )}
            <p className="text-[10px] leading-snug text-muted-foreground">{t.pdf.calibPageNote}</p>
          </div>
        )}
        {numPages > 1 && (
          <div className="flex w-fit items-center gap-1 rounded-full border bg-card/95 px-1.5 py-1 shadow-lg backdrop-blur">
            <button
              disabled={pageNum <= rangeLoBound}
              onClick={() => setPageNum((p) => Math.max(rangeLoBound, p - 1))}
              className="rounded-full p-2 hover:bg-muted disabled:opacity-40"
              title={t.pdf.pageNum}
            ><ChevronLeft className="h-4 w-4" /></button>
            <span className="flex items-center gap-1 text-xs font-medium tabular-nums">
              <input
                key={pageNum}
                defaultValue={pageNum}
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const n = parseInt((e.target as HTMLInputElement).value, 10);
                    if (n >= rangeLoBound && n <= rangeHiBound) setPageNum(n);
                  }
                }}
                onBlur={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (n >= rangeLoBound && n <= rangeHiBound && n !== pageNum) setPageNum(n);
                }}
                className="h-6 w-9 rounded-md border bg-background px-1 text-center text-xs"
                title={t.pdf.pageNum}
              />
              / {numPages}
            </span>
            <button
              disabled={pageNum >= rangeHiBound}
              onClick={() => setPageNum((p) => Math.min(rangeHiBound, p + 1))}
              className="rounded-full p-2 hover:bg-muted disabled:opacity-40"
              title={t.pdf.pageNum}
            ><ChevronRight className="h-4 w-4" /></button>
            <button
              onClick={() => { setRangeLo(String(rangeLoBound)); setRangeHi(String(rangeHiBound)); setRangeOpen(true); }}
              className="ml-0.5 rounded-full border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted"
              title={t.pdf.pagesEdit}
            >{pageRange ? `${rangeLoBound}–${rangeHiBound}` : t.pdf.pagesAll}</button>
          </div>
        )}
        </div>
        </div>
      </div>
      {/* Šoninis stulpelis */}
      <div className="space-y-3">
        {/* OCR būsena ir žiniaraščio peržiūra */}
        {tool === 'scan' && !scanning && !reviewRows && (
          <div className="rounded-xl border border-violet-300 bg-violet-50 p-3 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
            {t.pdf.scanHintA} <b>{t.pdf.ocrTable}</b> {t.pdf.scanHintB}
          </div>
        )}
        {scanning && (
          <div className="rounded-xl border p-3 text-sm">
            <p className="font-medium">{scanProgress ? t.pdf.autoScanning : t.pdf.scanning}</p>
            {scanProgress ? (
              <div className="mt-2 space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((scanProgress.done / scanProgress.total) * 100)}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t.pdf.autoPage} {rangeLoBound + scanProgress.done} / {rangeHiBound}</span>
                  <button onClick={() => { autoCancelRef.current = true; }} className="rounded-md border px-2 py-0.5 hover:bg-muted">{t.pdf.autoCancel}</button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t.pdf.ocrFirst}</p>
            )}
          </div>
        )}
        {scanError && (
          <div className="space-y-2">
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              ⚠️ {scanError}
            </p>
            {scanPreview && (
              <div className="rounded-lg border p-1.5">
                <p className="mb-1 text-[10px] text-muted-foreground">{t.pdf.scannedArea}</p>
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
            {t.pdf.matchHintA} <b>{t.pdf.oneSymbol}</b> {t.pdf.matchHintB}
          </div>
        )}
        {matching && (
          <div className="rounded-xl border p-3 text-sm">
            <p className="font-medium">{t.pdf.matching} {Math.round(matchProgress * 100)} %</p>
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
              {matchThumb && <img src={matchThumb} alt={t.pdf.template} className="h-10 rounded border" />}
              <div>
                <p className="text-sm font-semibold">
                  {t.pdf.found} {matchResults.filter((m) => !m.excluded).length} {t.pdf.foundOf} {matchResults.length}
                </p>
                <p className="text-[11px] text-muted-foreground">{t.pdf.thumbRemove}</p>
              </div>
            </div>
            <div className="mb-3 grid max-h-56 grid-cols-4 gap-1.5 overflow-auto">
              {matchResults.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setMatchResults((rs) => rs?.map((x, j) => (j === i ? { ...x, excluded: !x.excluded } : x)) ?? null)}
                  className={`relative overflow-hidden rounded border ${m.excluded ? 'opacity-40 grayscale' : 'border-amber-400'}`}
                  title={`${t.pdf.similarity} ${(m.score * 100).toFixed(0)} %`}
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
                {t.pdf.addNPcs} {matchResults.filter((m) => !m.excluded).length} {t.pdf.pcs}
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
            <ClipboardPlus className="h-3.5 w-3.5" /> {t.pdf.manualEntry}
          </button>
        )}
        {/* Naujo matavimo forma: telefone – lipni apatinė kortelė (bottom sheet) */}
        {form && (
          <div onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (cutting && cutPts.length >= 3) finishCutting(); else saveForm(); } }} className="space-y-2 rounded-xl border border-primary/50 p-3 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:max-h-[75vh] max-lg:overflow-auto max-lg:rounded-b-none max-lg:border-t-2 max-lg:bg-background max-lg:shadow-[0_-10px_44px_rgba(0,0,0,0.3)]">
            <p className="text-sm font-semibold">
              {form.kind === 'length' ? t.pdf.formLength : form.kind === 'area' ? t.pdf.formArea : `${t.pdf.formCount} (${form.pts.length} ${t.pdf.pcs})`}
            </p>
            <label className="block text-xs">
              {t.pdf.fCategory}
              <select
                value={form.category}
                onChange={(e) => {
                  const cat = e.target.value as ElementCategory;
                  const autoName = `${categoryLabel(form.category)} (${t.pdf.pageShort}${pageNum})`;
                  setForm({
                    ...form,
                    category: cat,
                    name: form.name === autoName ? `${categoryLabel(cat)} (${t.pdf.pageShort}${pageNum})` : form.name,
                  });
                }}
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
              </select>
            </label>
            <label className="block text-xs">
              {t.pdf.fName}
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, nameSuggested: false })}
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
              {form.nameSuggested && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{t.pdf.nameSuggested}</span>
              )}
            </label>
            {form.axesZone && (
              <p className="rounded-md bg-sky-50 px-2 py-1.5 text-[11px] text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                {t.pdf.axesZone} <b>{form.axesZone}</b> {t.pdf.axesNote}
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
                  ? `${t.pdf.dimOk} ${form.dimCheck.dimMm} mm`
                  : `${t.pdf.dimWarn} ${form.dimCheck.dimMm} mm ${t.pdf.dimWarnSuffix}`}
              </p>
            )}
            {form.kind === 'length' && (
              <label className="block text-xs">
                {t.pdf.fHeight} ({uLabel('m', units)})
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
                  {t.pdf.genFinishes}
                </label>
                {form.genFinishes !== false && (
                  <div className="mt-2 flex items-center gap-3">
                    <label className="text-xs text-violet-900 dark:text-violet-200">
                      {t.pdf.roomHeight} ({uLabel('m', units)})
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
                      {t.pdf.deductOpenings}
                    </label>
                  </div>
                )}
              </div>
            )}
            {form.kind === 'area' && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-2.5 dark:border-rose-900 dark:bg-rose-950">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-rose-900 dark:text-rose-200">
                    <Scissors className="h-3.5 w-3.5" />{t.pdf.cutoutTitle}
                  </span>
                  <button
                    onClick={() => { if (cutting) finishCutting(); else { setCutting(true); setCutPts([]); } }}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs font-semibold',
                      cutting ? 'bg-rose-600 text-white hover:bg-rose-700' : 'border border-rose-300 text-rose-800 hover:bg-rose-100 dark:text-rose-200',
                    )}
                  >
                    {cutting ? t.pdf.cutoutDone : t.pdf.cutoutStart}
                  </button>
                </div>
                {cutting && (
                  <p className="mt-1.5 text-[11px] text-rose-800 dark:text-rose-300">
                    {t.pdf.cutoutHint} ({cutPts.length} {t.pdf.pcs})
                  </p>
                )}
                {deducts.length > 0 && (
                  <div className="mt-1.5 flex items-center justify-between text-[11px] font-medium text-rose-900 dark:text-rose-200">
                    <span>
                      {t.pdf.cutoutRemoved}: −{calibrated
                        ? `${fmtQty(netDeductArea(form.pts, deducts) / (unitsPerMeter! * unitsPerMeter!), 'm²', 2, units)} ${uLabel('m²', units)}`
                        : `${deducts.length}`}
                    </span>
                    <button onClick={() => setDeducts([])} className="underline hover:no-underline">{t.pdf.cutoutClear}</button>
                  </div>
                )}
              </div>
            )}
            {(form.kind === 'length' || form.kind === 'area') && (
              <label className="block text-xs">
                {t.pdf.fThickness} ({uLabel('m', units)})
                <input value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })}
                  inputMode="decimal" placeholder={t.pdf.optional}
                  className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
              </label>
            )}
            {form.kind === 'count' && (
              <>
                <label className="block text-xs">
                  {t.pdf.fPerArea} ({uLabel('m²', units)})
                  <input value={form.perArea} onChange={(e) => setForm({ ...form, perArea: e.target.value })}
                    inputMode="decimal" placeholder={t.pdf.optional}
                    className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
                </label>
                <label className="block text-xs">
                  {t.pdf.fPerVolume} ({uLabel('m³', units)})
                  <input value={form.perVolume} onChange={(e) => setForm({ ...form, perVolume: e.target.value })}
                    inputMode="decimal" placeholder={t.pdf.optional}
                    className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
                </label>
              </>
            )}
            <label className="block text-xs">
              {t.pdf.fMaterial}
              <input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}
                placeholder={t.pdf.materialPh}
                className="mt-0.5 h-9 w-full rounded-md border bg-background px-2 text-sm" />
            </label>
            <div className="flex gap-1.5 pt-1">
              <button onClick={saveForm} className="flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">{t.pdf.add}</button>
              <button onClick={() => { setForm(null); setCutting(false); setCutPts([]); setDeducts([]); }} className="rounded-md border px-3 py-1.5 text-sm">{t.pdf.cancel}</button>
            </div>
          </div>
        )}

        {/* Matavimų sąrašas */}
        <div className="rounded-xl border p-3">
          <p className="mb-2 text-sm font-semibold">{t.pdf.measurements} ({items.length})</p>
          <p className="mb-2 hidden text-[10px] leading-snug text-muted-foreground lg:block">{t.pdf.shortcuts}</p>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t.pdf.emptyHint}
            </p>
          )}
          <ul className="space-y-1.5">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-2 rounded-lg border p-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_INFO[i.category].color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{i.name}</p>
                  <p className="text-muted-foreground tabular-nums">
                    {i.length_m !== undefined && `${fmtQty(i.length_m, 'm', 2, units)} ${uLabel('m', units)} · `}
                    {i.area_m2 !== undefined && `${fmtQty(i.area_m2, 'm²', 2, units)} ${uLabel('m²', units)} · `}
                    {i.volume_m3 !== undefined && `${fmtQty(i.volume_m3, 'm³', 2, units)} ${uLabel('m³', units)} · `}
                    {i.count} {t.pdf.pcs} · p.{i.pdfPage}
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
