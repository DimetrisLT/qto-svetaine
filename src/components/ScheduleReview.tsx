import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { CATEGORY_ORDER, categoryLabel, type ElementCategory, type QtoItem } from '@/types/qto';
import { useI18n } from '@/i18n/I18nContext';
import type { ScannedRow } from '@/lib/ocr/scanSchedule';
import { uid } from '@/types/qto';

const UNITS: QtoItem['unit'][] = ['vnt.', 'm', 'm²', 'm³', 'kg'];

/** Įtartina eilutė: nerealus kiekis (tikėtina OCR klaida ar kontekstinis skaičius) */
export function isSuspicious(r: ScannedRow): boolean {
  return r.qty < 0.5 || r.qty > 1_000_000 || (r.name.replace(/\P{L}/gu, '').length > 0 && r.name.trim().length < 4);
}

interface Props {
  rows: ScannedRow[];
  title: string;
  onSave: (rows: ScannedRow[]) => void;
  onCancel: () => void;
}

/** Nuskaitytų (arba ranka įvestų) projekto pozicijų peržiūros ir taisymo langas */
export default function ScheduleReview({ rows: initial, title, onSave, onCancel }: Props) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ScannedRow[]>(initial);

  const update = (id: string, patch: Partial<ScannedRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addRow = () => {
    setRows((rs) => [...rs, {
      id: uid(), include: true, name: '', category: 'other', unit: 'vnt.', qty: 1, raw: '',
    }]);
  };

  const selected = rows.filter((r) => r.include).length;
  const suspicious = rows.filter((r) => r.include && isSuspicious(r));

  return (
    <div className="rounded-xl border border-primary/50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t.report.reviewNoteA} <b>{t.report.projData.toLowerCase()}</b>.
      </p>
      <div className="max-h-[380px] overflow-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 sticky top-0">
            <tr className="text-left">
              <th className="px-2 py-1.5 w-6"></th>
              <th className="px-2 py-1.5">{t.report.thName}</th>
              <th className="px-2 py-1.5 w-28">{t.report.thCat}</th>
              <th className="px-2 py-1.5 w-16">{t.report.zinCols.unit}</th>
              <th className="px-2 py-1.5 w-16">{t.report.thQty}</th>
              <th className="px-2 py-1.5 w-16">{t.report.thPerVol}</th>
              <th className="px-2 py-1.5 w-24">{t.report.thMat}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t ${r.include ? '' : 'opacity-40'} ${r.include && isSuspicious(r) ? 'bg-amber-50 dark:bg-amber-950/40' : ''}`} title={r.include && isSuspicious(r) ? `${t.report.suspiciousRow}${r.raw ? ` · OCR: ${r.raw}` : ''}` : r.raw ? `OCR: ${r.raw}` : undefined}>
                <td className="px-2 py-1">
                  <input type="checkbox" checked={r.include} onChange={(e) => update(r.id, { include: e.target.checked })} />
                </td>
                <td className="px-1 py-1">
                  <div className="flex items-center gap-1">
                    {r.page !== undefined && (
                      <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium text-muted-foreground">p.{r.page}</span>
                    )}
                    <input
                      value={r.name}
                      onChange={(e) => update(r.id, { name: e.target.value })}
                      className="h-7 w-full min-w-[180px] rounded border bg-background px-1"
                    />
                  </div>
                </td>
                <td className="px-1 py-1">
                  <select
                    value={r.category}
                    onChange={(e) => update(r.id, { category: e.target.value as ElementCategory })}
                    className="h-7 w-full rounded border bg-background px-0.5"
                  >
                    {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <select
                    value={r.unit}
                    onChange={(e) => update(r.id, { unit: e.target.value as QtoItem['unit'] })}
                    className="h-7 w-full rounded border bg-background px-0.5"
                  >
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <input
                    value={String(r.qty)}
                    inputMode="decimal"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value.replace(',', '.'));
                      if (!Number.isNaN(v)) update(r.id, { qty: v });
                    }}
                    className="h-7 w-full rounded border bg-background px-1 text-right"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={r.perVolume !== undefined ? String(r.perVolume) : ''}
                    inputMode="decimal"
                    placeholder="—"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value.replace(',', '.'));
                      update(r.id, { perVolume: Number.isNaN(v) ? undefined : v });
                    }}
                    className="h-7 w-full rounded border bg-background px-1 text-right"
                  />
                </td>
                <td className="px-1 py-1">
                  <input
                    value={r.material ?? ''}
                    onChange={(e) => update(r.id, { material: e.target.value || undefined })}
                    className="h-7 w-full rounded border bg-background px-1"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {suspicious.length > 0 && (
        <button
          onClick={() => setRows((rs) => rs.map((r) => (isSuspicious(r) ? { ...r, include: false } : r)))}
          className="w-full rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          ⚠ {t.report.excludeSuspicious} ({suspicious.length})
        </button>
      )}
      <div className="flex gap-1.5">
        <button onClick={addRow} className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
          <Plus className="h-3.5 w-3.5" /> {t.report.addRow}
        </button>
        <button
          onClick={() => onSave(rows)}
          disabled={selected === 0}
          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          <Check className="h-4 w-4" /> {t.report.includeN} ({selected})
        </button>
      </div>
    </div>
  );
}
