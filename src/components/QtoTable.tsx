import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { CATEGORY_INFO, CATEGORY_ORDER, type QtoItem, type SourceType } from '@/types/qto';
import { fmt } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Props {
  items: QtoItem[];
  onDelete?: (id: string) => void;
  showSource?: boolean;
  compact?: boolean;
}

export default function QtoTable({ items, onDelete, showSource = true, compact = false }: Props) {
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
        Kolkas kiekių nėra – įkelkite IFC, PDF arba DXF failą atitinkamoje kortelėje.
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
            <option value="all">Visos kategorijos</option>
            {presentCats.map((c) => (
              <option key={c} value={c}>{CATEGORY_INFO[c].lt}</option>
            ))}
          </select>
          {showSource && (
            <select
              value={srcFilter}
              onChange={(e) => setSrcFilter(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              <option value="all">Visi šaltiniai</option>
              {sources.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <span className="ml-auto self-center text-xs text-muted-foreground">
            Rodoma {filtered.length} iš {items.length}
          </span>
        </div>
      )}
      <div className="overflow-auto rounded-lg border max-h-[520px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 sticky top-0">
            <tr className="text-left">
              {showSource && <th className="px-3 py-2 font-medium">Šaltinis</th>}
              {showSource && <th className="px-3 py-2 font-medium">Dalis</th>}
              <th className="px-3 py-2 font-medium">Kategorija</th>
              <th className="px-3 py-2 font-medium">Pavadinimas</th>
              <th className="px-3 py-2 font-medium">Medžiaga</th>
              <th className="px-3 py-2 font-medium text-right">Ilgis, m</th>
              <th className="px-3 py-2 font-medium text-right">Aukštis, m</th>
              <th className="px-3 py-2 font-medium text-right">Plotas, m²</th>
              <th className="px-3 py-2 font-medium text-right">Tūris, m³</th>
              <th className="px-3 py-2 font-medium text-right">Vnt.</th>
              {onDelete && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className="border-t hover:bg-muted/30" title={i.note}>
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
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                    style={{ backgroundColor: CATEGORY_INFO[i.category].color }} />
                  {CATEGORY_INFO[i.category].lt}
                </td>
                <td className="px-3 py-1.5 max-w-[280px] truncate" title={i.name}>{i.name}</td>
                <td className="px-3 py-1.5 max-w-[160px] truncate text-muted-foreground">{i.material ?? '—'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(i.length_m)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(i.height_m)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(i.area_m2)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(i.volume_m3)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{i.count}</td>
                {onDelete && (
                  <td className="px-2 py-1.5">
                    <button
                      onClick={() => onDelete(i.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Pašalinti eilutę"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
