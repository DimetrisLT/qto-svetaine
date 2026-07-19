// Automatinis PDF mastelio aptikimas: tekstas („M 1:100“) + lapo formatas (A3…)

export interface ScaleSuggestion {
  unitsPerMeter: number;
  scale: number;      // pvz., 100 (reiškia 1:100)
  paperName: string;  // pvz., „A3“
  source: 'text' | 'paper';
}

interface PaperSize { name: string; wMm: number; hMm: number }

// Standartiniai formatai (portretas), mm
const PAPERS: PaperSize[] = [
  { name: 'A4', wMm: 210, hMm: 297 },
  { name: 'A3', wMm: 297, hMm: 420 },
  { name: 'A2', wMm: 420, hMm: 594 },
  { name: 'A1', wMm: 594, hMm: 841 },
  { name: 'A0', wMm: 841, hMm: 1189 },
];

const PT_PER_MM = 72 / 25.4;

/** Dažniausi statybos brėžinių masteliai – prioritetas atpažįstant */
const COMMON_SCALES = [100, 50, 20, 25, 200, 500, 10, 5, 250, 75, 150];

/** Iš teksto ištraukia mastelį (pvz., „M1:100“, „Mastelis 1:50“, „1:200“) */
export function detectScaleFromText(text: string): number | null {
  const re = /1\s*:\s*(\d{1,4})/g;
  const found = new Map<number, number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = parseInt(m[1], 10);
    if (s >= 1 && s <= 5000) found.set(s, (found.get(s) ?? 0) + 1);
  }
  if (found.size === 0) return null;
  // Pirmiausia – dažniausi masteliai pagal pasikartojimus, tada pagal COMMON prioritetą
  const entries = [...found.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    const ia = COMMON_SCALES.indexOf(a[0]);
    const ib = COMMON_SCALES.indexOf(b[0]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return entries[0][0];
}

/** Atpažįsta lapo formatą iš matmenų punktais (bet kokia orientacija) */
export function paperFromPoints(wPt: number, hPt: number): PaperSize | null {
  const wMm = wPt / PT_PER_MM;
  const hMm = hPt / PT_PER_MM;
  for (const p of PAPERS) {
    const tol = 3; // mm paklaida (pdf būna suapvalinta)
    const portrait = Math.abs(wMm - p.wMm) <= tol && Math.abs(hMm - p.hMm) <= tol;
    const landscape = Math.abs(wMm - p.hMm) <= tol && Math.abs(hMm - p.wMm) <= tol;
    if (portrait || landscape) return p;
  }
  return null;
}

/** Apskaičiuoja vienetų/metrą: lapo plotis pt → realus plotis (formato mm × mastelis) */
export function unitsPerMeterFor(wPt: number, hPt: number, scale: number): number | null {
  const paper = paperFromPoints(wPt, hPt);
  if (!paper || scale <= 0) return null;
  const wMm = wPt / PT_PER_MM;
  // Kuri formato kraštinė atitinka lapo plotį
  const paperWMm = Math.abs(wMm - paper.wMm) <= Math.abs(wMm - paper.hMm) ? paper.wMm : paper.hMm;
  const realM = (paperWMm * scale) / 1000;
  return wPt / realM;
}

/** Pilnas pasiūlymas puslapiui: formatas + mastelis iš teksto */
export function suggestForPage(wPt: number, hPt: number, text: string): ScaleSuggestion | null {
  const paper = paperFromPoints(wPt, hPt);
  const scale = detectScaleFromText(text);
  if (paper && scale) {
    const upm = unitsPerMeterFor(wPt, hPt, scale);
    if (upm) return { unitsPerMeter: upm, scale, paperName: paper.name, source: 'text' };
  }
  return null;
}

/** Kiek procentų rankinė kalibracija nukrypsta nuo aptiktos */
export function deviationPct(userUpm: number, detectedUpm: number): number {
  return (Math.abs(userUpm - detectedUpm) / detectedUpm) * 100;
}
