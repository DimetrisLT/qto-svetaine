import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { Building2 } from 'lucide-react';
import { trpc } from '@/providers/trpc';
import SummaryCards from '@/components/SummaryCards';
import ZiniarastisTable from '@/components/ZiniarastisTable';
import SelfCheckPanel from '@/components/SelfCheckPanel';
import { runSelfChecks } from '@/lib/selfCheck';
import type { QtoItem, SourceMeta } from '@/types/qto';

interface SharedData {
  version: 1;
  savedAt: string;
  itemsBySource: Record<string, QtoItem[]>;
  metas: Record<string, SourceMeta>;
}

/** Vieša read-only peržiūra (be prisijungimo) – dalijimasis su užsakovu */
export default function SharedView() {
  const { token } = useParams<{ token: string }>();
  const q = trpc.shares.getPublic.useQuery({ token: token ?? '' }, { enabled: !!token, retry: false });

  const parsed = useMemo(() => {
    if (!q.data) return null;
    const d = q.data.data as SharedData;
    const items = Object.values(d.itemsBySource ?? {}).flat();
    return { items, metas: Object.values(d.metas ?? {}) };
  }, [q.data]);

  const checks = useMemo(
    () => (parsed ? runSelfChecks(parsed.items, parsed.metas) : []),
    [parsed],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4">
          <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">{q.data?.name ?? 'Bendrinamas projektas'}</h1>
            <p className="text-xs text-muted-foreground">Peržiūra tik skaitymui · QTO</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {q.isLoading && <p className="text-sm text-muted-foreground">Kraunama…</p>}
        {q.error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-6 text-center">
            <p className="text-sm font-medium text-destructive">Nuoroda negalioja arba atšaukta.</p>
            <Link to="/" className="mt-2 inline-block text-xs text-primary hover:underline">Į QTO pradžią →</Link>
          </div>
        )}
        {parsed && (
          <>
            <SummaryCards items={parsed.items} />
            <div>
              <h3 className="mb-1 text-lg font-semibold">Darbų kiekių žiniaraštis</h3>
              <p className="mb-2 text-xs text-muted-foreground">Sugrupuota pagal darbų grupes · {parsed.items.length} pozicijos</p>
              <ZiniarastisTable items={parsed.items} />
            </div>
            <div className="rounded-xl border p-4">
              <SelfCheckPanel checks={checks} />
            </div>
            <p className="pb-6 text-center text-xs text-muted-foreground">
              Sugeneruota su QTO — kiekiai yra orientaciniai, prieš naudojimą sąmatose juos turi patikrinti sąmatininkas.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
