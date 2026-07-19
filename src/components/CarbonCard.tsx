import { useMemo } from 'react';
import { Leaf } from 'lucide-react';
import { summarizeCarbon } from '@/lib/carbon';
import { CATEGORY_INFO } from '@/types/qto';
import { fmt } from '@/lib/format';
import type { QtoItem } from '@/types/qto';

/** CO₂e suvestinė: bendras pėdsakas + skaidymas pagal kategorijas */
export default function CarbonCard({ items }: { items: QtoItem[] }) {
  const s = useMemo(() => summarizeCarbon(items), [items]);
  if (s.ratedCount === 0) return null;
  const tonnes = s.totalKg / 1000;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Leaf className="h-5 w-5" />
        </span>
        <div>
          <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
            ~{fmt(tonnes, 2)} t CO₂e
          </p>
          <p className="text-xs text-emerald-800/80 dark:text-emerald-200/80">
            Orientacinis anglies pėdsakas (A1–A3) · įvertinta {s.ratedCount} iš {items.length} pozicijų
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        {s.byCategory.slice(0, 5).map((c) => (
          <div key={c.category} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_INFO[c.category]?.color ?? '#9ca3af' }} />
            <span className="w-32 truncate">{CATEGORY_INFO[c.category]?.lt ?? c.category}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900">
              <span
                className="block h-full bg-emerald-500"
                style={{ width: `${(c.kgCO2e / s.totalKg) * 100}%` }}
              />
            </span>
            <span className="w-20 text-right font-medium">{fmt(c.kgCO2e / 1000, 2)} t</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-emerald-800/70 dark:text-emerald-200/60">
        Koeficientai orientaciniai (ICE Database / EPD vidurkiai) – skirti variantų palyginimui, ne sertifikuotam LCA vertinimui.
      </p>
    </div>
  );
}
