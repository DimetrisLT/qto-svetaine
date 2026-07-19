import { useMemo, useRef, useState } from 'react';
import { FilePlus2, FileText, Trash2 } from 'lucide-react';
import FileDrop from '@/components/FileDrop';
import PdfViewer from '@/components/PdfViewer';
import { DISCIPLINES, detectDiscipline, uid, type QtoItem, type SourceMeta } from '@/types/qto';
import { cn } from '@/lib/utils';

interface PdfFileEntry {
  id: string;
  name: string;
  file: File;
  discipline: string;
  unitsPerMeter: number | null;
  detectedUpm: number | null;
}

interface Props {
  items: QtoItem[];
  onData: (items: QtoItem[], meta: SourceMeta) => void;
  /** Išsaugoto projekto failų metaduomenys – kalibracijoms ir pririšimui atkurti */
  savedFilesMeta?: SourceMeta['pdfFiles'];
}

/** Projekto režimas: keli susiję PDF failai (A, SK, VK dalys) kaip viena visuma */
export default function PdfSection({ items, onData, savedFilesMeta }: Props) {
  const [files, setFiles] = useState<PdfFileEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Išsaugotą failų sąrašą įsimename vieną kartą – vėlesni emit() jo nenublukina,
  // todėl visi perinkti failai ras savo kalibracijas.
  const savedRef = useRef(savedFilesMeta);

  const active = files.find((f) => f.id === activeId) ?? null;

  const emit = (nextItems: QtoItem[], nextFiles: PdfFileEntry[]) => {
    onData(nextItems, {
      source: 'PDF',
      parsed: nextFiles.length > 0,
      scaleCalibrated: nextFiles.every((f) => f.unitsPerMeter !== null),
      pdfFiles: nextFiles.map((f) => ({
        id: f.id, name: f.name, discipline: f.discipline, calibrated: f.unitsPerMeter !== null,
        upm: f.unitsPerMeter, detectedUpm: f.detectedUpm,
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

  const setCalibration = (id: string, upm: number | null) => {
    const nextFiles = files.map((f) => (f.id === id ? { ...f, unitsPerMeter: upm } : f));
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
            Atkurtos <strong>{items.length}</strong> pozicijos iš išsaugoto projekto. Įkelkite tuos pačius PDF failus
            (sutapdinsime pagal pavadinimą) – mastelis, projekto dalis ir pozicijų pririšimas bus atkurti automatiškai.
          </div>
        )}
        <FileDrop
        accept=".pdf"
        label="Įkelkite projekto PDF brėžinius"
        hint="Galite įkelti kelis susijusius failus: architektūros dalį (A), konstrukcijų dalį (SK), inžinerines dalis (VK, E, Š, V). Kiekvienas failas kalibruojamas atskirai, o visi matavimai sueina į bendrą darbų kiekių žiniaraštį."
        onFile={addFile}
      />
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
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors',
              f.id === activeId ? 'border-primary bg-primary/5 shadow-sm' : 'hover:bg-muted/60',
            )}
          >
            <button onClick={() => setActiveId(f.id)} className="flex items-center gap-2 text-left">
              <FileText className={cn('h-4 w-4', f.id === activeId ? 'text-primary' : 'text-muted-foreground')} />
              <span className="max-w-[220px] truncate font-medium">{f.name}</span>
            </button>
            <select
              value={f.discipline}
              onChange={(e) => setDiscipline(f.id, e.target.value)}
              title="Projekto dalis"
              className="h-7 rounded-md border bg-background px-1 text-xs"
            >
              {DISCIPLINES.map((d) => (
                <option key={d.code} value={d.code}>{d.code} – {d.lt}</option>
              ))}
            </select>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                f.unitsPerMeter
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
              )}
              title={f.unitsPerMeter ? 'Mastelis sukalibruotas' : 'Reikia kalibruoti mastelį'}
            >
              {f.unitsPerMeter ? '✓ mastelis' : '! mastelis'}
            </span>
            <button onClick={() => removeFile(f.id)} className="text-muted-foreground hover:text-destructive" title="Pašalinti failą">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {adding ? (
          <div className="w-full max-w-xl">
            <FileDrop accept=".pdf" label="Pridėti dar vieną PDF" onFile={addFile} />
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-primary"
          >
            <FilePlus2 className="h-4 w-4" /> Pridėti PDF
          </button>
        )}
      </div>

      {active && (
        <PdfViewer
          key={active.id}
          fileId={active.id}
          file={active.file}
          discipline={active.discipline}
          unitsPerMeter={active.unitsPerMeter}
          onCalibrate={(upm) => setCalibration(active.id, upm)}
          onDetectScale={(upm) => setDetectedScale(active.id, upm)}
          items={activeItems}
          onItemsChange={handleItemsChange}
        />
      )}
    </div>
  );
}
