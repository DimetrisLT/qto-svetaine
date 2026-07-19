import { useMemo } from 'react';
import { FileSpreadsheet, ClipboardCopy } from 'lucide-react';
import SummaryCards from '@/components/SummaryCards';
import QtoTable from '@/components/QtoTable';
import ZiniarastisTable from '@/components/ZiniarastisTable';
import SelfCheckPanel from '@/components/SelfCheckPanel';
import AssemblyPanel from '@/components/AssemblyPanel';
import { runSelfChecks } from '@/lib/selfCheck';
import { buildCsv, exportToExcel } from '@/lib/exportExcel';
import type { QtoItem, SourceMeta, SourceType } from '@/types/qto';
import { useState } from 'react';

interface Props {
  itemsBySource: Record<SourceType, QtoItem[]>;
  metas: SourceMeta[];
  onDeleteItem: (source: SourceType, id: string) => void;
  onAddItems: (source: SourceType, newItems: QtoItem[]) => void;
}

export default function ReportSection({ itemsBySource, metas, onDeleteItem, onAddItems }: Props) {
  const [copied, setCopied] = useState(false);
  const items = useMemo(
    () => [...itemsBySource.IFC, ...itemsBySource.PDF, ...itemsBySource.DXF],
    [itemsBySource],
  );
  const checks = useMemo(() => runSelfChecks(items, metas), [items, metas]);
  const warns = checks.filter((c) => c.status === 'warn').length;

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(buildCsv(items));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      <SummaryCards items={items} />

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => exportToExcel(items, checks)}
          disabled={items.length === 0}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
        >
          <FileSpreadsheet className="h-4 w-4" /> Atsisiųsti Excel (XLSX)
        </button>
        <button
          onClick={copyCsv}
          disabled={items.length === 0}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40"
        >
          <ClipboardCopy className="h-4 w-4" /> {copied ? '✓ Nukopijuota!' : 'Kopijuoti CSV'}
        </button>
      </div>

      <AssemblyPanel
        items={items}
        onAdd={(lines) => {
          const bySource = new Map<SourceType, QtoItem[]>();
          for (const l of lines) {
            const arr = bySource.get(l.source) ?? [];
            arr.push(l);
            bySource.set(l.source, arr);
          }
          for (const [src, arr] of bySource) onAddItems(src, arr);
        }}
      />

      <div>
        <h3 className="mb-1 text-lg font-semibold">Darbų kiekių žiniaraštis</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Kiekiai iš visų šaltinių (IFC, PDF dalys, DXF) sugrupuoti pagal darbų grupes – pagrindas detaliosioms sąmatoms.
        </p>
        <ZiniarastisTable items={items} />
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold">Kiekių suvestinė (detaliai)</h3>
        <QtoTable
          items={items}
          onDelete={(id) => {
            const src = items.find((i) => i.id === id)?.source;
            if (src) onDeleteItem(src, id);
          }}
        />
      </div>

      <div className={`rounded-xl border p-4 ${warns ? 'border-amber-300' : 'border-emerald-300'}`}>
        <SelfCheckPanel checks={checks} />
      </div>
    </div>
  );
}
