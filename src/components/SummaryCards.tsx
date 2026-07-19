import { useMemo } from 'react';
import { CATEGORY_INFO, CATEGORY_ORDER, type QtoItem } from '@/types/qto';
import { fmt } from '@/lib/format';

export default function SummaryCards({ items }: { items: QtoItem[] }) {
  const cards = useMemo(() => {
    const byCat = new Map<string, { n: number; m2: number; m3: number; vnt: number }>();
    for (const i of items) {
      if (!byCat.has(i.category)) byCat.set(i.category, { n: 0, m2: 0, m3: 0, vnt: 0 });
      const c = byCat.get(i.category)!;
      c.n += 1;
      c.m2 += i.area_m2 ?? 0;
      c.m3 += i.volume_m3 ?? 0;
      c.vnt += i.count;
    }
    return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({ cat: c, ...byCat.get(c)! }));
  }, [items]);

  if (!cards.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {cards.map(({ cat, n, m2, m3, vnt }) => (
        <div key={cat} className="rounded-xl border p-3" style={{ borderTopColor: CATEGORY_INFO[cat]?.color ?? '#9ca3af', borderTopWidth: 3 }}>
          <p className="text-xs font-medium text-muted-foreground">{CATEGORY_INFO[cat]?.lt ?? cat}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {m3 > 0 ? `${fmt(m3)} m³` : m2 > 0 ? `${fmt(m2)} m²` : `${vnt} vnt.`}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {n} eil. · {m2 > 0 && m3 > 0 ? `${fmt(m2)} m² · ` : ''}{vnt} vnt.
          </p>
        </div>
      ))}
    </div>
  );
}
