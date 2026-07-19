import { Suspense, lazy, useState } from 'react';
import { Building2, FileText, Layers3, ClipboardList } from 'lucide-react';
import type { QtoItem, SourceMeta, SourceType } from '@/types/qto';
import { cn } from '@/lib/utils';

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

export default function App() {
  const [tab, setTab] = useState<Tab>('ifc');
  const [itemsBySource, setItemsBySource] = useState<Record<SourceType, QtoItem[]>>({ IFC: [], PDF: [], DXF: [] });
  const [metas, setMetas] = useState<Record<SourceType, SourceMeta>>(EMPTY_META);

  const handleData = (source: SourceType) => (items: QtoItem[], meta: SourceMeta) => {
    setItemsBySource((s) => ({ ...s, [source]: items }));
    setMetas((s) => ({ ...s, [source]: meta }));
  };

  const deleteItem = (source: SourceType, id: string) => {
    setItemsBySource((s) => ({ ...s, [source]: s[source].filter((i) => i.id !== id) }));
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
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5">
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
          {tab === 'ifc' && (
            <IfcSection
              fileName={metas.IFC.fileName}
              onData={(items, meta) => { handleData('IFC')(items, meta); }}
            />
          )}
          {tab === 'pdf' && (
            <PdfSection
              fileName={metas.PDF.fileName}
              items={itemsBySource.PDF}
              onData={handleData('PDF')}
            />
          )}
          {tab === 'dxf' && (
            <DxfSection
              fileName={metas.DXF.fileName}
              items={itemsBySource.DXF}
              onData={handleData('DXF')}
            />
          )}
          {tab === 'report' && (
            <ReportSection
              itemsBySource={itemsBySource}
              metas={Object.values(metas)}
              onDeleteItem={deleteItem}
            />
          )}
          </Suspense>
        </main>

        <footer className="mt-10 border-t pt-4 pb-8 text-center text-xs text-muted-foreground">
          Visi skaičiavimai atliekami jūsų naršyklėje – failai niekur nesiunčiami.
        </footer>
      </div>
    </div>
  );
}
