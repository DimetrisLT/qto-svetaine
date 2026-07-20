import { useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, FileText, Trash2 } from 'lucide-react';
import FileDrop from '@/components/FileDrop';
import EmptyGuide from '@/components/EmptyGuide';
import PdfViewer from '@/components/PdfViewer';
import { DISCIPLINES, detectDiscipline, disciplineLabel, uid, type QtoItem, type SourceMeta } from '@/types/qto';
import { useI18n } from '@/i18n/I18nContext';
import { cn } from '@/lib/utils';

interface PdfFileEntry {
  id: string;
  name: string;
  file: File;
  discipline: string;
  unitsPerMeter: number | null;
  detectedUpm: number | null;
  /** Skirtingas mastelis atskiriems puslapiams */
  upmByPage?: Record<number, number>;
}

interface Props {
  items: QtoItem[];
  onData: (items: QtoItem[], meta: SourceMeta) => void;
  /** Išsaugoto projekto failų metaduomenys – kalibracijoms ir pririšimui atkurti */
  savedFilesMeta?: SourceMeta['pdfFiles'];
  /** „Rodyti brėžinyje“ užklausa iš žiniaraščio */
  locate?: { pdfFile: string; pdfPage: number; points: { x: number; y: number }[]; ts: number } | null;
}

/** Projekto režimas: keli susiję PDF failai (A, SK, VK dalys) kaip viena visuma */
export default function PdfSection({ items, onData, savedFilesMeta, locate = null }: Props) {
  const { t, locale } = useI18n();
  const [files, setFiles] = useState<PdfFileEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [locateMissing, setLocateMissing] = useState(false);
  // Išsaugotą failų sąrašą įsimename vieną kartą – vėlesni emit() jo nenublukina,
  // todėl visi perinkti failai ras savo kalibracijas.
  const savedRef = useRef(savedFilesMeta);
  // Projekto tęsimas: meta gali atsirasti jau po mount – sinchronizuojame neprarasdami naujausių kalibracijų
  useEffect(() => {
    if (savedFilesMeta?.length) {
      const prev = savedRef.current ?? [];
      savedRef.current = savedFilesMeta.map((f) => {
        const old = prev.find((x) => x.name === f.name);
        return (old?.upm || old?.upmByPage) && !f.upm && !f.upmByPage ? { ...f, upm: old.upm ?? null, upmByPage: old.upmByPage ?? undefined } : f;
      });
    }
  }, [savedFilesMeta]);

  const active = files.find((f) => f.id === activeId) ?? null;

  // „Rodyti brėžinyje“: perjungiame į reikiamą failą; jei failas neįkeltas – pranešame
  useEffect(() => {
    if (!locate) return;
    if (files.some((f) => f.id === locate.pdfFile)) {
      setActiveId(locate.pdfFile);
      setLocateMissing(false);
    } else {
      setLocateMissing(true);
      const t = setTimeout(() => setLocateMissing(false), 7000);
      return () => clearTimeout(t);
    }
  }, [locate?.ts]);

  const emit = (nextItems: QtoItem[], nextFiles: PdfFileEntry[]) => {
    onData(nextItems, {
      source: 'PDF',
      parsed: nextFiles.length > 0,
      scaleCalibrated: nextFiles.every((f) => f.unitsPerMeter !== null || Object.keys(f.upmByPage ?? {}).length > 0),
      pdfFiles: nextFiles.map((f) => ({
        id: f.id, name: f.name, discipline: f.discipline,
        calibrated: f.unitsPerMeter !== null || Object.keys(f.upmByPage ?? {}).length > 0,
        upm: f.unitsPerMeter, detectedUpm: f.detectedUpm, upmByPage: f.upmByPage ?? null,
      })),
    });
  };

  const addFile = (file: File) => {
    // Jei failas su tokiu pavadinimu jau buvo projekte – atstatome kalibraciją
    // ir pririšame atkurtas pozicijas prie naujo failo id.
    const saved = savedRef.current?.find((s) => s.name === file.name);
    const entry: PdfFileEntry = {
      id: uid(),
      name: file.name,
      file,
      discipline: saved?.discipline ?? detectDiscipline(file.name),
      unitsPerMeter: saved?.upm ?? null,
      detectedUpm: saved?.detectedUpm ?? null,
      upmByPage: saved?.upmByPage ?? undefined,
    };
    const nextItems = saved ? items.map((i) => (i.pdfFile === saved.id ? { ...i, pdfFile: entry.id } : i)) : items;
    const next = [...files, entry];
    setFiles(next);
    setActiveId(entry.id);
    setAdding(false);
    emit(nextItems, next);
  };

  const removeFile = (id: string) => {
    const nextFiles = files.filter((f) => f.id !== id);
    const nextItems = items.filter((i) => i.pdfFile !== id);
    setFiles(nextFiles);
    if (activeId === id) setActiveId(nextFiles[0]?.id ?? null);
    emit(nextItems, nextFiles);
  };

  const setDiscipline = (id: string, discipline: string) => {
    const nextFiles = files.map((f) => (f.id === id ? { ...f, discipline } : f));
    setFiles(nextFiles);
    // Atnaujiname ir šio failo elementų žymas
    const nextItems = items.map((i) => (i.pdfFile === id ? { ...i, discipline } : i));
    emit(nextItems, nextFiles);
  };

  const setCalibration = (id: string, upm: number | null, scope: 'page' | 'all' = 'all', page = 1) => {
    const nextFiles = files.map((f) => {
      if (f.id !== id) return f;
      if (scope === 'all') {
        // Taikoma visiems: failo numatytoji + išmetame pasenusių per-page reikšmių (paliekame kitų lapų)
        const upmByPage = { ...(f.upmByPage ?? {}) };
        if (upm === null) return { ...f, unitsPerMeter: null, upmByPage: undefined };
        delete upmByPage[page];
        return { ...f, unitsPerMeter: upm, upmByPage: Object.keys(upmByPage).length ? upmByPage : undefined };
      }
      const upmByPage = { ...(f.upmByPage ?? {}) };
      if (upm === null) delete upmByPage[page]; else upmByPage[page] = upm;
      return { ...f, upmByPage: Object.keys(upmByPage).length ? upmByPage : undefined };
    });
    setFiles(nextFiles);
    emit(items, nextFiles);
  };

  const setDetectedScale = (id: string, upm: number | null) => {
    setFiles((prev) => {
      // Pirmas aptiktas mastelis „laimi“ – neperrašome kaskart iš naujo
      const target = prev.find((f) => f.id === id);
      if (!target || target.detectedUpm !== null || upm === null) return prev;
      const nextFiles = prev.map((f) => (f.id === id ? { ...f, detectedUpm: upm } : f));
      emit(items, nextFiles);
      return nextFiles;
    });
  };

  const [pageByFile, setPageByFile] = useState<Record<string, number>>({});
  const activePage = active ? (pageByFile[active.id] ?? 1) : 1;
  const activeItems = useMemo(() => items.filter((i) => i.pdfFile === activeId), [items, activeId]);

  const handleItemsChange = (nextFileItems: QtoItem[]) => {
    const others = items.filter((i) => i.pdfFile !== activeId);
    emit([...others, ...nextFileItems], files);
  };

  if (files.length === 0) {
    return (
      <div className="space-y-3">
        {items.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            {t.pdf.restoredA} <strong>{items.length}</strong> {t.pdf.restoredB}
          </div>
        )}
        <FileDrop
        accept=".pdf"
        label={t.pdf.drop}
        hint={t.pdf.hint}
        onFile={addFile}
        sample={{ url: locale === 'en' ? '/sample-plan.pdf' : '/pavyzdys-planas.pdf', fileName: locale === 'en' ? 'sample-plan.pdf' : 'pavyzdys-planas.pdf' }}
      />
      <EmptyGuide />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Projekto failų juosta */}
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f) => (
          <div
            key={f.id}
            className={cn(
              'flex max-w-full flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
              f.id === activeId ? 'border-primary bg-primary/5 shadow-sm' : 'hover:bg-muted/60',
            )}
          >
            <button onClick={() => setActiveId(f.id)} className="flex items-center gap-2 text-left">
              <FileText className={cn('h-4 w-4', f.id === activeId ? 'text-primary' : 'text-muted-foreground')} />
              <span className="max-w-[130px] truncate font-medium sm:max-w-[220px]">{f.name}</span>
            </button>
            <select
              value={f.discipline}
              onChange={(e) => setDiscipline(f.id, e.target.value)}
              title={t.pdf.discTitle}
              className="h-7 max-w-[106px] rounded-md border bg-background px-1 text-xs sm:max-w-none"
            >
              {DISCIPLINES.map((d) => (
                <option key={d.code} value={d.code}>{d.code} – {disciplineLabel(d.code)}</option>
              ))}
            </select>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                f.unitsPerMeter || Object.keys(f.upmByPage ?? {}).length > 0
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
              )}
              title={f.unitsPerMeter || Object.keys(f.upmByPage ?? {}).length > 0 ? t.pdf.calibrated : t.pdf.needCalibrate}
            >
              {f.unitsPerMeter || Object.keys(f.upmByPage ?? {}).length > 0 ? t.pdf.scaleOk : t.pdf.scaleMissing}
            </span>
            <button onClick={() => removeFile(f.id)} className="text-muted-foreground hover:text-destructive" title={t.pdf.removeFile}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {adding ? (
          <div className="w-full max-w-xl">
            <FileDrop accept=".pdf" label={t.pdf.addAnother} onFile={addFile} />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            <FilePlus2 className="h-4 w-4" /> {t.pdf.addShort}
          </button>
        )}
      </div>

      {locateMissing && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {t.pdf.locateMissing}
        </p>
      )}

      {active && (
        <PdfViewer
          key={active.id}
          fileId={active.id}
          file={active.file}
          discipline={active.discipline}
          unitsPerMeter={active.upmByPage?.[activePage] ?? active.unitsPerMeter}
          onCalibrate={(upm, scope) => setCalibration(active.id, upm, scope ?? 'all', activePage)}
          onPageChange={(p) => setPageByFile((m) => ({ ...m, [active.id]: p }))}
          onDetectScale={(upm) => setDetectedScale(active.id, upm)}
          items={activeItems}
          onItemsChange={handleItemsChange}
          locate={locate && active.id === locate.pdfFile ? locate : null}
        />
      )}
    </div>
  );
}
