import { useMemo, useState } from 'react';
import { CheckCircle2, Crosshair, Pencil, Trash2 } from 'lucide-react';
import { CATEGORY_INFO, CATEGORY_ORDER, ORIGIN_INFO, categoryLabel, originLabel, type QtoItem, type SourceType } from '@/types/qto';
import { fmtQty, uLabel } from '@/lib/format';
import { useUnitSystem } from '@/lib/units';
import { useI18n } from '@/i18n/I18nContext';
import { cn } from '@/lib/utils';

interface Props {
  items: QtoItem[];
  onDelete?: (id: string) => void;
  onEdit?: (item: QtoItem) => void;
  /** „Rodyti brėžinyje“ – perjungti į PDF vietą (jei pozicija turi taškus) */
  onLocate?: (item: QtoItem) => void;
  /** Tikrinimo statuso perjungimas */
  onToggleVerify?: (item: QtoItem) => void;
  showSource?: boolean;
  compact?: boolean;
}

export default function QtoTable({ items, onDelete, onEdit, onLocate, onToggleVerify, showSource = true, compact = false }: Props) {
  const { t } = useI18n();
  const units = useUnitSystem();
  const [catFilter, setCatFilter] = useState<string>('all');
  const [srcFilter, setSrcFilter] = useState<string>('all');

  const filtered = useMemo(() => items.filter((i) =>
    (catFilter === 'all' || i.category === catFilter) &&
    (srcFilter === 'all' || i.source === srcFilter)), [items, catFilter, srcFilter]);

  const presentCats = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [items]);

  const sources: SourceType[] = ['IFC', 'PDF', 'DXF'];

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {t.report.emptyYet}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap gap-2">
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="all">{t.report.catAll}</option>
            {presentCats.map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </select>
          {showSource && (
            <select
              value={srcFilter}
              onChange={(e) => setSrcFilter(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">{t.report.thSourceAll}</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <span className="ml-auto self-center text-xs text-muted-foreground">
            {t.report.showing} {filtered.length} {t.report.ofWord} {items.length}
          </span>
        </div>
      )}
      <div className="overflow-auto rounded-lg border max-h-[520px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 sticky top-0">
            <tr className="text-left">
              {showSource && <th className="px-3 py-2 font-medium">{t.report.thSource}</th>}
              {showSource && <th className="px-3 py-2 font-medium">{t.report.thDisc}</th>}
              {showSource && <th className="px-3 py-2 font-medium">{t.report.thOrigin}</th>}
              <th className="px-3 py-2 font-medium">{t.report.thCat}</th>
              <th className="px-3 py-2 font-medium">{t.report.thName}</th>
              <th className="px-3 py-2 font-medium">{t.report.thMat}</th>
              <th className="px-3 py-2 font-medium text-right">{t.report.thLen}, {uLabel('m', units)}</th>
              <th className="px-3 py-2 font-medium text-right">{t.report.thH}, {uLabel('m', units)}</th>
              <th className="px-3 py-2 font-medium text-right">{t.report.thArea}, {uLabel('m²', units)}</th>
              <th className="px-3 py-2 font-medium text-right">{t.report.thVol}, {uLabel('m³', units)}</th>
              <th className="px-3 py-2 font-medium text-right">{t.pdf.pcs}</th>
              {(onDelete || onEdit || onLocate || onToggleVerify) && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className={cn('border-t hover:bg-muted/30', i.verified && 'bg-emerald-50/60 dark:bg-emerald-950/20')} title={i.note}>
                {showSource && (
                  <td className="px-3 py-1.5">
                    <span className={cn(
                      'inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold',
                      i.source === 'IFC' && 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
                      i.source === 'PDF' && 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
                      i.source === 'DXF' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
                    )}>{i.source}</span>
                  </td>
                )}
                {showSource && (
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{i.discipline ?? '—'}</td>
                )}
                {showSource && (
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        i.origin === 'project'
                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                      )}
                      title={originLabel(i.origin)}
                    >
                      {ORIGIN_INFO[i.origin]?.short ?? 'AI'}
                    </span>
                  </td>
                )}
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                    style={{ backgroundColor: CATEGORY_INFO[i.category].color }} />
                  {categoryLabel(i.category)}
                </td>
                <td className="px-3 py-1.5 max-w-[280px] truncate" title={i.name}>{i.name}</td>
                <td className="px-3 py-1.5 max-w-[160px] truncate text-muted-foreground">{i.material ?? '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtQty(i.length_m, 'm', 2, units)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtQty(i.height_m, 'm', 2, units)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtQty(i.area_m2, 'm²', 2, units)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtQty(i.volume_m3, 'm³', 2, units)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.count}</td>
                {(onDelete || onEdit || onLocate || onToggleVerify) && (
                  <td className="px-2 py-1.5">
                    <span className="flex items-center gap-1.5">
                      {onToggleVerify && (
                        <button
                          onClick={() => onToggleVerify(i)}
                          className={i.verified ? 'text-emerald-600' : 'text-muted-foreground/40 hover:text-emerald-600'}
                          title={i.verified ? t.report.verifyOff : t.report.verifyOn}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {onLocate && i.pdfPoints && i.pdfPoints.length > 0 && (
                        <button
                          onClick={() => onLocate(i)}
                          className="text-muted-foreground hover:text-primary"
                          title={t.report.locate}
                        >
                          <Crosshair className="h-4 w-4" />
                        </button>
                      )}
                      {onEdit && (
                        <button
                          onClick={() => onEdit(i)}
                          className="text-muted-foreground hover:text-primary"
                          title={t.report.edit}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(i.id)}
                          className="text-muted-foreground hover:text-destructive"
                          title={t.report.delete}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
