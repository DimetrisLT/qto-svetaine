import { useMemo } from 'react';
import { FileSpreadsheet, ClipboardCopy, FileText } from 'lucide-react';
import SummaryCards from '@/components/SummaryCards';
import QtoTable from '@/components/QtoTable';
import ZiniarastisTable from '@/components/ZiniarastisTable';
import SelfCheckPanel from '@/components/SelfCheckPanel';
import AssemblyPanel from '@/components/AssemblyPanel';
import EditItemDialog from '@/components/EditItemDialog';
import PrintReport from '@/components/PrintReport';
import CarbonCard from '@/components/CarbonCard';
import { runSelfChecks } from '@/lib/selfCheck';
import { buildCsv, exportToExcel } from '@/lib/exportExcel';
import type { QtoItem, SourceMeta, SourceType } from '@/types/qto';
import { useState } from 'react';

interface Props {
  itemsBySource: Record<SourceType, QtoItem[]>;
  metas: SourceMeta[];
  onDeleteItem: (source: SourceType, id: string) => void;
  onAddItems: (source: SourceType, newItems: QtoItem[]) => void;
  onUpdateItem: (source: SourceType, id: string, patch: Partial<QtoItem>) => void;
  onLocateItem?: (item: QtoItem) => void;
  onToggleVerify?: (item: QtoItem) => void;
}

export default function ReportSection({ itemsBySource, metas, onDeleteItem, onAddItems, onUpdateItem, onLocateItem, onToggleVerify }: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<QtoItem | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [verifyFilter, setVerifyFilter] = useState<'all' | 'todo' | 'done'>('all');
  const items = useMemo(
    () => [...itemsBySource.IFC, ...itemsBySource.PDF, ...itemsBySource.DXF],
    [itemsBySource],
  );
  const verifiedCount = items.filter((i) => i.verified).length;
  const filteredItems = useMemo(() => {
    if (verifyFilter === 'done') return items.filter((i) => i.verified);
    if (verifyFilter === 'todo') return items.filter((i) => !i.verified);
    return items;
  }, [items, verifyFilter]);
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

      <CarbonCard items={items} />

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
        <button
          onClick={() => setShowReport(true)}
          disabled={items.length === 0}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40"
        >
          <FileText className="h-4 w-4" /> PDF ataskaita
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
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold">Kiekių suvestinė (detaliai)</h3>
          {onToggleVerify && items.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={verifiedCount === items.length ? 'font-medium text-emerald-700 dark:text-emerald-400' : ''}>
                ✓ patikrinta {verifiedCount}/{items.length}
              </span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full bg-emerald-500 transition-all"
                  style={{ width: `${(verifiedCount / items.length) * 100}%` }}
                />
              </span>
              <select
                value={verifyFilter}
                onChange={(e) => setVerifyFilter(e.target.value as 'all' | 'todo' | 'done')}
                className="h-7 rounded-md border bg-background px-1.5 text-xs"
              >
                <option value="all">Visos</option>
                <option value="todo">Tik nepatikrintos</option>
                <option value="done">Tik patikrintos</option>
              </select>
            </div>
          )}
        </div>
        <QtoTable
          items={filteredItems}
          onEdit={setEditing}
          onLocate={onLocateItem}
          onToggleVerify={onToggleVerify}
          onDelete={(id) => {
            const src = items.find((i) => i.id === id)?.source;
            if (src) onDeleteItem(src, id);
          }}
        />
      </div>

      <div className={`rounded-xl border p-4 ${warns ? 'border-amber-300' : 'border-emerald-300'}`}>
        <SelfCheckPanel checks={checks} />
      </div>

      {showReport && (
        <PrintReport items={items} metas={metas} onClose={() => setShowReport(false)} />
      )}

      {editing && (
        <EditItemDialog
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(draft) => {
            const { id, source, ...patch } = draft;
            if (!id || !source) return;
            onUpdateItem(source, id, patch);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
