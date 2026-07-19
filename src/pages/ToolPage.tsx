import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Building2, FileText, Layers3, ClipboardList, Download, Upload, History, CloudUpload, LogIn, LayoutGrid, Undo2, Redo2 } from 'lucide-react';
import type { QtoItem, SourceMeta, SourceType } from '@/types/qto';
import { cn } from '@/lib/utils';
import {
  clearProject, downloadProjectJson, formatSavedAt, loadProject, parseProjectJson, saveProject, totalItems,
  type SavedProject,
} from '@/lib/projectStore';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';

// Sunkiosios bibliotekos (web-ifc, three, pdfjs) užkraunamos tik pagal poreikį
const IfcSection = lazy(() => import('@/sections/IfcSection'));
const PdfSection = lazy(() => import('@/sections/PdfSection'));
const DxfSection = lazy(() => import('@/sections/DxfSection'));
const ReportSection = lazy(() => import('@/sections/ReportSection'));

type Tab = 'ifc' | 'pdf' | 'dxf' | 'report';

const EMPTY_META: Record<SourceType, SourceMeta> = {
  IFC: { source: 'IFC', parsed: false },
  PDF: { source: 'PDF', parsed: false },
  DXF: { source: 'DXF', parsed: false },
};

export default function ToolPage() {
  const [tab, setTab] = useState<Tab>('ifc');
  // „Rodyti brėžinyje“: žiniaraščio pozicija → PDF failas/puslapis/taškai
  const [locateTarget, setLocateTarget] = useState<{ pdfFile: string; pdfPage: number; points: { x: number; y: number }[]; ts: number } | null>(null);
  const [itemsBySource, setItemsBySource] = useState<Record<SourceType, QtoItem[]>>({ IFC: [], PDF: [], DXF: [] });
  const [metas, setMetas] = useState<Record<SourceType, SourceMeta>>(EMPTY_META);
  // Rastas anksčiau išsaugotas darbas – siūlome tęsti (kol vartotojas nesprendžia, automatinis saugojimas pristabdytas)
  const [restoredOffer, setRestoredOffer] = useState<SavedProject | null>(() => {
    const p = loadProject();
    return p && totalItems(p) > 0 ? p : null;
  });
  const importInputRef = useRef<HTMLInputElement>(null);

  // --- Debesies integracija (portalas) ---
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const cloudId = Number(searchParams.get('project')) || null;
  const [cloudName, setCloudName] = useState<string | null>(null);
  const [cloudFlash, setCloudFlash] = useState<string | null>(null);
  const cloudLoadedRef = useRef(false);
  const cloudQuery = trpc.projects.get.useQuery(
    { id: cloudId! },
    { enabled: !!cloudId && isAuthenticated && !cloudLoadedRef.current, retry: false },
  );
  const utils = trpc.useUtils();
  const cloudCreate = trpc.projects.create.useMutation();
  const cloudUpdate = trpc.projects.update.useMutation();

  // Projekto iš debesies užkrovimas (vieną kartą)
  useEffect(() => {
    const p = cloudQuery.data;
    if (!p || cloudLoadedRef.current) return;
    cloudLoadedRef.current = true;
    const data = p.data as SavedProject;
    const s = data.itemsBySource;
    setItemsBySource({ IFC: s.IFC ?? [], PDF: s.PDF ?? [], DXF: s.DXF ?? [] });
    setMetas({ ...EMPTY_META, ...data.metas });
    setRestoredOffer(null);
    setCloudName(p.name);
  }, [cloudQuery.data]);

  const handleCloudSave = () => {
    const data: SavedProject = { version: 1, savedAt: new Date().toISOString(), itemsBySource, metas };
    const itemCount = totalItems(data);
    const done = (msg: string) => {
      setCloudFlash(msg);
      setTimeout(() => setCloudFlash(null), 2500);
      utils.projects.list.invalidate();
    };
    if (cloudId && cloudName) {
      cloudUpdate.mutate({ id: cloudId, name: cloudName, data, itemCount }, { onSuccess: () => done('✓ Projektas atnaujintas debesyje') });
    } else {
      const name = window.prompt('Projekto pavadinimas:', cloudName ?? `Projektas ${new Date().toLocaleDateString('lt-LT')}`);
      if (!name) return;
      cloudCreate.mutate({ name, data, itemCount }, { onSuccess: () => { setCloudName(name); done('✓ Projektas įrašytas į paskyrą'); } });
    }
  };

  // Automatinis darbo išsaugojimas (localStorage) su nedidele pauze po pakeitimų
  useEffect(() => {
    if (restoredOffer) return;
    const hasData = totalItems({ version: 1, savedAt: '', itemsBySource, metas }) > 0
      || metas.IFC.parsed || metas.PDF.parsed || metas.DXF.parsed;
    if (!hasData) return;
    const t = setTimeout(() => saveProject(itemsBySource, metas), 800);
    return () => clearTimeout(t);
  }, [itemsBySource, metas, restoredOffer]);

  const handleRestore = () => {
    if (!restoredOffer) return;
    const s = restoredOffer.itemsBySource;
    setItemsBySource({ IFC: s.IFC ?? [], PDF: s.PDF ?? [], DXF: s.DXF ?? [] });
    setMetas({ ...EMPTY_META, ...restoredOffer.metas });
    setRestoredOffer(null);
  };

  const handleStartNew = () => {
    clearProject();
    setRestoredOffer(null);
  };

  const handleExportJson = () => downloadProjectJson(itemsBySource, metas);

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const p = parseProjectJson(await f.text());
    if (p) {
      pushHistory();
      const s = p.itemsBySource;
      setItemsBySource({ IFC: s.IFC ?? [], PDF: s.PDF ?? [], DXF: s.DXF ?? [] });
      setMetas({ ...EMPTY_META, ...p.metas });
      setRestoredOffer(null);
    }
  };

  // --- Undo/redo istorija (Ctrl+Z / Ctrl+Y; sesijos metu, iki 50 žingsnių) ---
  const undoRef = useRef<Array<Record<SourceType, QtoItem[]>>>([]);
  const redoRef = useRef<Array<Record<SourceType, QtoItem[]>>>([]);
  const [histTick, setHistTick] = useState(0);
  const itemsRef = useRef(itemsBySource);
  itemsRef.current = itemsBySource;

  const pushHistory = () => {
    undoRef.current.push(itemsRef.current);
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
    setHistTick((t) => t + 1);
  };

  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(itemsRef.current);
    setItemsBySource(prev);
    setHistTick((t) => t + 1);
  };

  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(itemsRef.current);
    setItemsBySource(next);
    setHistTick((t) => t + 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleData = (source: SourceType) => (items: QtoItem[], meta: SourceMeta) => {
    if (items !== itemsRef.current[source]) pushHistory();
    setItemsBySource((s) => ({ ...s, [source]: items }));
    setMetas((s) => ({ ...s, [source]: meta }));
  };

  const deleteItem = (source: SourceType, id: string) => {
    pushHistory();
    setItemsBySource((s) => ({ ...s, [source]: s[source].filter((i) => i.id !== id) }));
  };

  const addItems = (source: SourceType, newItems: QtoItem[]) => {
    pushHistory();
    setItemsBySource((s) => ({ ...s, [source]: [...s[source], ...newItems] }));
  };

  const updateItem = (source: SourceType, id: string, patch: Partial<QtoItem>) => {
    pushHistory();
    setItemsBySource((s) => ({
      ...s,
      [source]: s[source].map((i) => (i.id === id ? { ...i, ...patch, id: i.id, source: i.source } : i)),
    }));
  };

  /** „Rodyti brėžinyje“ – perjungia į PDF kortelę ir paryškina matavimą */
  const locateItem = (item: QtoItem) => {
    if (item.source !== 'PDF' || !item.pdfPoints?.length || !item.pdfFile) return;
    setLocateTarget({ pdfFile: item.pdfFile, pdfPage: item.pdfPage ?? 1, points: item.pdfPoints, ts: Date.now() });
    setTab('pdf');
  };

  const toggleVerify = (item: QtoItem) => {
    if (!item.id) return;
    updateItem(item.source, item.id, { verified: !item.verified });
  };

  const counts: Record<SourceType, number> = {
    IFC: itemsBySource.IFC.length,
    PDF: itemsBySource.PDF.length,
    DXF: itemsBySource.DXF.length,
  };
  const total = counts.IFC + counts.PDF + counts.DXF;

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'ifc', label: 'IFC modelis', icon: <Building2 className="h-4 w-4" />, badge: counts.IFC },
    { id: 'pdf', label: 'PDF brėžinys', icon: <FileText className="h-4 w-4" />, badge: counts.PDF },
    { id: 'dxf', label: 'DXF brėžinys', icon: <Layers3 className="h-4 w-4" />, badge: counts.DXF },
    { id: 'report', label: 'Ataskaita', icon: <ClipboardList className="h-4 w-4" />, badge: total },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">QTO – Statybos kiekių surinkimas</h1>
            <p className="text-xs text-muted-foreground">IFC · PDF · DXF → kiekiai, savikontrolė, Excel</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className={cn('flex items-center gap-0.5', histTick >= 0 && '')}>
              <button
                onClick={undo}
                disabled={undoRef.current.length === 0}
                title="Atšaukti (Ctrl+Z)"
                className="flex items-center rounded-lg border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={redo}
                disabled={redoRef.current.length === 0}
                title="Grąžinti (Ctrl+Y)"
                className="flex items-center rounded-lg border px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted-foreground"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </span>
            {cloudFlash && <span className="mr-1 text-xs font-medium text-emerald-600">{cloudFlash}</span>}
            {cloudName && <span className="mr-1 hidden max-w-[180px] truncate text-xs text-muted-foreground sm:inline" title="Atidarytas iš portalo">☁ {cloudName}</span>}
            {isAuthenticated ? (
              <>
                <button
                  onClick={handleCloudSave}
                  disabled={cloudCreate.isPending || cloudUpdate.isPending}
                  title="Įrašyti projektą į paskyrą (debesį)"
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <CloudUpload className="h-3.5 w-3.5" /> {cloudId && cloudName ? 'Atnaujinti' : 'Įrašyti į paskyrą'}
                </button>
                <Link
                  to="/portal"
                  title="Mano projektai (portalas)"
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Portalas
                </Link>
              </>
            ) : (
              <Link
                to="/login"
                title="Prisijungti – projektų saugojimas debesyje"
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <LogIn className="h-3.5 w-3.5" /> Prisijungti
              </Link>
            )}
            <button
              onClick={handleExportJson}
              title="Atsisiųsti projektą JSON failu (pozicijos + kalibracijos)"
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Download className="h-3.5 w-3.5" /> Projektas
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              title="Atidaryti anksčiau išsaugotą projektą (JSON)"
              className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              <Upload className="h-3.5 w-3.5" /> Atidaryti
            </button>
            <input ref={importInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportJson} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5">
        {restoredOffer && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
            <History className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm">
              Rastas automatiškai išsaugotas darbas: <strong>{totalItems(restoredOffer)}</strong> pozicijos,
              išsaugota {formatSavedAt(restoredOffer.savedAt)}.
            </p>
            <div className="ml-auto flex gap-2">
              <button
                onClick={handleRestore}
                className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
              >
                Tęsti projektą
              </button>
              <button
                onClick={handleStartNew}
                className="rounded-lg border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Pradėti naujai
              </button>
            </div>
          </div>
        )}
        <nav className="mb-5 flex flex-wrap gap-1.5 rounded-xl border bg-muted/40 p-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                tab === t.id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:bg-background/60',
              )}
            >
              {t.icon}
              {t.label}
              {(t.badge ?? 0) > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <main>
          <Suspense fallback={<p className="rounded-xl border p-6 text-sm text-muted-foreground">Kraunama…</p>}>
          {/* Sekcijas laikome prijungtas (tik pasleptas) – kitaip perjungus skirtuką
              būtų prarandami įkelti PDF failai ir IFC/DXF būsena */}
          <div className={tab === 'ifc' ? '' : 'hidden'}>
            <IfcSection
              fileName={metas.IFC.fileName}
              onData={(items, meta) => { handleData('IFC')(items, meta); }}
            />
          </div>
          <div className={tab === 'pdf' ? '' : 'hidden'}>
            <PdfSection
              items={itemsBySource.PDF}
              onData={handleData('PDF')}
              savedFilesMeta={metas.PDF.pdfFiles}
              locate={locateTarget}
            />
          </div>
          <div className={tab === 'dxf' ? '' : 'hidden'}>
            <DxfSection
              fileName={metas.DXF.fileName}
              items={itemsBySource.DXF}
              onData={handleData('DXF')}
            />
          </div>
          <div className={tab === 'report' ? '' : 'hidden'}>
            <ReportSection
              itemsBySource={itemsBySource}
              metas={Object.values(metas)}
              onDeleteItem={deleteItem}
              onAddItems={addItems}
              onUpdateItem={updateItem}
              onLocateItem={locateItem}
              onToggleVerify={toggleVerify}
            />
          </div>
          </Suspense>
        </main>

        <footer className="mt-10 border-t pt-4 pb-8 text-center text-xs text-muted-foreground">
          Visi skaičiavimai atliekami jūsų naršyklėje – failai niekur nesiunčiami.
        </footer>
      </div>
    </div>
  );
}
