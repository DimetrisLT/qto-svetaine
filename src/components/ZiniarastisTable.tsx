import { useMemo } from 'react';
import { CATEGORY_INFO, ORIGIN_INFO, originLabel, type QtoItem } from '@/types/qto';
import { buildZiniarastis } from '@/lib/works';
import { fmtQty, uLabel } from '@/lib/format';
import { useUnitSystem } from '@/lib/units';
import { useI18n } from '@/i18n/I18nContext';
import { cn } from '@/lib/utils';

/** Darbų kiekių žiniaraštis – sugrupuota sąmatinė forma */
export default function ZiniarastisTable({ items }: { items: QtoItem[] }) {
  const { t, locale } = useI18n();
  const units = useUnitSystem();
  const groups = useMemo(() => buildZiniarastis(items), [items, locale]);

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t.report.empty}
      </p>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium w-16">{t.report.zinCols.no}</th>
            <th className="px-3 py-2 font-medium">{t.report.zinCols.name}</th>
            <th className="px-3 py-2 font-medium w-20">{t.report.zinCols.unit}</th>
            <th className="px-3 py-2 font-medium w-28 text-right">{t.report.zinCols.qty}</th>
            <th className="px-3 py-2 font-medium w-32">{t.report.zinCols.src}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ group, rows }) => (
            <>
              <tr key={group.code} className="border-t bg-muted/40">
                <td colSpan={5} className="px-3 py-2 font-semibold">
                  {group.code} {group.title}
                </td>
              </tr>
              {rows.map((r, i) => (
                <tr key={`${group.code}-${i}`} className="border-t hover:bg-muted/20">
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{group.code}.{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                      style={{ backgroundColor: CATEGORY_INFO[r.category]?.color ?? '#9ca3af' }}
                    />
                    {r.name}
                    <span
                      className={cn(
                        'ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold',
                        r.origin === 'project'
                          ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                      )}
                      title={originLabel(r.origin)}
                    >
                      {ORIGIN_INFO[r.origin]?.short ?? 'proj.'}
                    </span>
                    <span className="ml-1 text-xs text-muted-foreground">({r.detailCount} {t.report.rowsN})</span>
                  </td>
                  <td className="px-3 py-1.5">{uLabel(r.unit, units)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtQty(r.qty, r.unit, 2, units)}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.sources.join(', ')}</td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
