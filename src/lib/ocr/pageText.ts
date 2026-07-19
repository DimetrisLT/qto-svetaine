// Pilno puslapio OCR rastriniams (skenuotiems) PDF:
// išskleidžia puslapį į canvas ir nuskaito žodžius su pozicijomis.
// Naudojama mastelio žymai („M 1:100“) ir pavadinimų pasiūlymams, kai nėra teksto sluoksnio.
import type { PDFPageProxy } from 'pdfjs-dist';
import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { TextItem } from '@/lib/pdf/textItems';

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng')
      .then(async (w) => {
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

const RENDER_SCALE = 1.5;

/** OCR su pozicijomis → TextItem[] mūsų pdf pt erdvėje; null jei nepavyko */
export async function ocrTextItems(page: PDFPageProxy): Promise<TextItem[] | null> {
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const worker = await getWorker();
  const res = await worker.recognize(canvas, {}, { tsv: true });
  const tsv = (res.data as { tsv?: string }).tsv ?? '';
  const items: TextItem[] = [];
  for (const line of tsv.split('\n').slice(1)) {
    const c = line.split('\t');
    if (c.length !== 12 || c[0] !== '5') continue;
    const conf = parseFloat(c[10]);
    const text = c[11]?.trim();
    if (!text || conf < 30) continue;
    items.push({ str: text, x: +c[6] / RENDER_SCALE, y: +c[7] / RENDER_SCALE });
  }
  return items.length > 0 ? items : null;
}
