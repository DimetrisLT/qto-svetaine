// Projekto žiniaraščių nuskaitymas iš brėžinių (OCR) ir eilučių analizė
import { createWorker, PSM, type Worker } from 'tesseract.js';
import { uid, type ElementCategory, type QtoItem } from '@/types/qto';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng')
      .then(async (w) => {
        // SPARSE_TEXT – suranda visus teksto fragmentus (lentelių langelius),
        // kuriuos įprastas automatinis segmentavimas praleidžia
        await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        return w;
      })
      .catch((e) => {
        workerPromise = null;
        throw e;
      });
  }
  return workerPromise;
}

/** Iš TSV žodžių atkuria teksto eilutes, grupuodamas pagal Y koordinatę */
function tsvToLines(tsv: string): string {
  const words = tsv
    .split('\n')
    .slice(1)
    .map((l) => l.split('\t'))
    .filter((c) => c.length === 12 && c[0] === '5' && c[11] && c[11].trim() && parseFloat(c[10]) > 30)
    .map((c) => ({ x: +c[6], y: +c[7], h: +c[9], text: c[11].trim() }));
  words.sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);

  interface Line { cy: number; h: number; words: typeof words }
  const lines: Line[] = [];
  for (const w of words) {
    const cy = w.y + w.h / 2;
    const last = lines[lines.length - 1];
    if (last && Math.abs(cy - last.cy) <= Math.max(8, last.h * 0.7)) {
      last.words.push(w);
      last.cy = (last.cy * (last.words.length - 1) + cy) / last.words.length;
      last.h = Math.max(last.h, w.h);
    } else {
      lines.push({ cy, h: w.h, words: [w] });
    }
  }
  return lines
    .map((l) => l.words.sort((a, b) => a.x - b.x).map((w) => w.text).join(' '))
    .join('\n');
}

/** OCR nuskaitymas iš canvas elemento (TSV + eilučių atkūrimas pagal Y) */
export async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const worker = await getWorker();
  const res = await worker.recognize(canvas, {}, { text: true, tsv: true });
  const fromTsv = res.data.tsv ? tsvToLines(res.data.tsv) : '';
  return fromTsv.trim().length > 0 ? fromTsv : res.data.text;
}

export interface ScannedRow {
  id: string;
  include: boolean;
  name: string;
  category: ElementCategory;
  unit: QtoItem['unit'];
  qty: number;
  /** m³ vienam vienetui (jei aptikta lentelėje) */
  perVolume?: number;
  material?: string;
  /** Originali OCR eilutė (kontrolai) */
  raw: string;
  /** Puslapis, kuriame rasta eilutė (auto nuskaitymui) */
  page?: number;
}

const CATEGORY_KEYWORDS: Array<[RegExp, ElementCategory]> = [
  [/POLI|PAMAT|FUND|ROSTVERK/i, 'footing'],
  [/SIEN|MŪR|MUR/i, 'wall'],
  [/PERDANG|PLIT|SLAB/i, 'slab'],
  [/SIJ/i, 'beam'],
  [/KOLON|KOLONN/i, 'column'],
  [/LAIPT/i, 'stair'],
  [/STROP|STOG/i, 'roof'],
  [/LANG/i, 'window'],
  [/DUR/i, 'door'],
  [/TINK|GLAIST|DAŽ|DAZ/i, 'fin_wall'],
  [/GRIND/i, 'fin_floor'],
  [/LUB/i, 'fin_ceiling'],
  [/ARMAT|STRYP|PLIEN/i, 'other'],
];

function guessCategory(name: string): ElementCategory {
  for (const [re, cat] of CATEGORY_KEYWORDS) {
    if (re.test(name)) return cat;
  }
  return 'other';
}

/** Eilutės valymas: OCR artefaktai, lentelių skirtukai */
function cleanLine(line: string): string {
  return line
    .replace(/[|~«»_\-–—]{2,}/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanName(name: string): string {
  return name
    .replace(/@/g, 'Ø')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,;:]+|[\s.,;:]+$/g, '')
    .trim();
}

// Vieneto žyma eilutėje (OCR variantai: VNT., M3, M?, Mi, M2, KG, T)
// Ribos – unicode-safe (JS \b nemato „ū“, „į“ ir pan., todėl „mūrijimas“ sugautų „m“)
const UNIT_RE = /(^|[^\p{L}\p{N}_])(VNTS?\.?|VNT\.?|KOMPL\.?|KPL\.?|M3|M\?|M³|MI|M2|M²|KV\.?M\.?²?|KUB\.?|KG|T\.?|ML|L|M)(?![\p{L}\p{N}_])/iu;
const NUM_RE = /(\d+[.,]\d+|\d+)/g;

/** Ar eilutė panaši į antraštę / pastabas (praleidžiama) */
function isSkippable(line: string): boolean {
  const u = line.toUpperCase();
  if (/(POZ\.|PAVADINIMAS|CHARAKTERISTIK|MATO\s|ARMAVIMAS|PASTAB|ŽINIARAŠT|ZINIARAST|EKSPLIKAC)/.test(u)) return true;
  if (/^VISO/.test(u)) return true; // sumos – perskaičiuojamos programoje
  // Brėžinių lapų antraštės ir pastabos, ne darbų pozicijos
  if (/(PLANAS|FASADA[IIS]?|PJŪVIS|PJUVIS|SHEMA|RŪSIS|RUSIS|PUSIAUSVYRA)\b/.test(u) && !/(ARDYMA|REMONTO|DANGOS|MŪRIJ|SIENŲ|GRINDŲ|STOGO DANGA)/.test(u)) return true;
  if (/ATLIKAMI DARBAI|PROJEKTUOJAMI|ESAMA BŪKLĖ|ESAMA BUKLE/.test(u)) return true;
  if (/PATALP[OSŲ]?\s*\.?\s*NR|PATALPA\s+PLOTAS/.test(u)) return true; // eksplikacijų antraštės
  if (/=/.test(line)) return true; // aukščių žymos („0,000 = 140,5“)
  return false;
}

/** Analizuoja OCR tekstą ir išima kiekių eilutes */
export function parseScheduleText(text: string): ScannedRow[] {
  const rows: ScannedRow[] = [];
  const lines = text.split('\n').map(cleanLine).filter((l) => l.length > 3);

  for (const line of lines) {
    if (isSkippable(line)) continue;
    const unitMatch = line.match(UNIT_RE);
    if (!unitMatch || unitMatch.index === undefined) continue;

    const unitToken = unitMatch[2].toUpperCase().replace('.', '');
    const unitIndex = unitMatch.index + unitMatch[1].length;
    let unit: QtoItem['unit'];
    if (unitToken.startsWith('VNT') || unitToken.startsWith('KOMPL') || unitToken.startsWith('KPL')) unit = 'vnt.';
    else if (unitToken === 'M3' || unitToken === 'M?' || unitToken === 'M³' || unitToken === 'MI' || unitToken === 'KUB') unit = 'm³';
    else if (unitToken === 'M2' || unitToken === 'M²' || unitToken === 'KVM') unit = 'm²';
    else if (unitToken === 'KG' || unitToken === 'T') unit = 'kg';
    else unit = 'm';

    let namePart = cleanName(line.slice(0, unitIndex));
    // Eilutės numeracija („1.1.“, „2.3.1“) – ne pavadinimo dalis
    namePart = namePart.replace(/^\d+(\.\d+)*\.?\s+/, '');
    // Tūkstantiniai skirtukai tarp skaitmenų („1 320,00“ → „1320,00“)
    const after = line.slice(unitIndex + unitMatch[2].length).replace(/(\d)\s+(?=\d{3}\b)/g, '$1');
    if (namePart.length < 3) continue;
    // Pavadinimas turi turėti bent 2 raides (atmesti „4,97“, „IV k“, „16-6 10.96“)
    const letters = (namePart.match(/\p{L}/gu) ?? []).length;
    if (letters < 2) continue;
    if (/^[\d\s.,\-–—:;/\\]+$/.test(namePart)) continue;

    const nums: number[] = [];
    let m: RegExpExecArray | null;
    NUM_RE.lastIndex = 0;
    while ((m = NUM_RE.exec(after)) !== null) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(v)) nums.push(v);
    }
    if (nums.length === 0) {
      // Atvirkštinė tvarka: kiekis PRIEŠ vienetą („Pertvaros 132,00 m²“)
      const before = namePart.replace(/(\d)\s+(?=\d{3}\b)/g, '$1');
      const tail = before.match(/^(.*?)\s+(\d+[.,]\d+|\d+)\s*$/);
      if (!tail) continue;
      const v = parseFloat(tail[2].replace(',', '.'));
      if (!Number.isFinite(v)) continue;
      namePart = cleanName(tail[1]);
      if (namePart.length < 3) continue;
      nums.push(v);
    }
    const qty = nums[0];
    if (qty <= 0) continue;

    // Tūris vienetui: jei eilutės pabaigoje yra a×b poros (kiekis × m³/vnt = viso m³)
    let perVolume: number | undefined;
    if (unit === 'vnt.' && nums.length >= 3) {
      const last = nums[nums.length - 1];
      const prev = nums[nums.length - 2];
      if (prev > 0 && Math.abs(qty * prev - last) / Math.max(last, 0.001) < 0.03) {
        perVolume = prev;
      }
    }

    // Medžiaga: betono klasė (C25/30) arba cemento/plieno žymos
    let material: string | undefined;
    const beton = line.match(/C\s?(\d{2}\/\d{2})/);
    if (beton) material = `Betonas C${beton[1]}`;

    rows.push({
      id: uid(),
      include: true,
      name: namePart,
      category: guessCategory(namePart),
      unit,
      qty: unit === 'kg' && unitToken === 'T' ? qty * 1000 : qty,
      perVolume,
      material,
      raw: line,
    });
  }
  return rows;
}

/** Konvertuoja patvirtintas eilutes į QTO elementus (projekto duomenys) */
/** Iš OCR teksto ištraukia „VISO“ eilučių sumas (trianguliacijai su pozicijų suma) */
export function extractVisoTotals(text: string): number[] {
  const totals: number[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim().toUpperCase();
    if (!line.startsWith('VISO')) continue;
    const nums = [...line.matchAll(/(\d+[.,]\d+|\d+)/g)]
      .map((m) => parseFloat(m[1].replace(',', '.')))
      .filter((n) => n > 0.001);
    totals.push(...nums);
  }
  // Unikalios reikšmės
  return [...new Set(totals.map((n) => Math.round(n * 1000) / 1000))];
}

export function rowsToItems(
  rows: ScannedRow[],
  ctx: { fileId: string; fileName: string; discipline: string; page: number },
  visoCandidates?: number[],
): QtoItem[] {
  return rows.filter((r) => r.include).map((r) => ({
    id: uid(),
    source: 'PDF' as const,
    category: r.category,
    name: r.name,
    material: r.material,
    length_m: r.unit === 'm' ? r.qty : undefined,
    area_m2: r.unit === 'm²' ? r.qty : undefined,
    volume_m3: r.unit === 'm³' ? r.qty : r.unit === 'vnt.' && r.perVolume ? Math.round(r.qty * r.perVolume * 1000) / 1000 : undefined,
    mass_kg: r.unit === 'kg' ? r.qty : undefined,
    count: r.unit === 'vnt.' ? r.qty : 1,
    unit: r.unit,
    origin: 'project' as const,
    pdfFile: ctx.fileId,
    discipline: ctx.discipline,
    pdfPage: ctx.page,
    note: `Projekto duomenys: „${ctx.fileName}“, p.${ctx.page}`,
    visoCandidates: visoCandidates && visoCandidates.length > 0 ? visoCandidates : undefined,
  }));
}
