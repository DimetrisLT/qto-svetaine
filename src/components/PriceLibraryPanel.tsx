import { useEffect, useRef, useState } from 'react';
import { BookMarked, Trash2, Upload } from 'lucide-react';
import { L } from '@/i18n/store';
import { loadLibrary, removeEntry, importPriceFile, type PriceEntry } from '@/lib/priceLibrary';
import { useAuth } from '@/hooks/useAuth';

/** Įkainių bibliotekos valdymo panelė (ataskaitos skyriuje) */
export default function PriceLibraryPanel() {
  const t = L({
    lt: {
      title: 'Įkainių biblioteka',
      hint: 'Kainą įvedate vieną kartą – programa siūlo automatiškai redaguojant pozicijas (vežama iš projekto į projektą).',
      import: 'Importuoti Excel/CSV',
      importing: 'Importuojama…',
      empty: 'Biblioteka tuščia. Kainos kaupiamos per pozicijų redagavimą (✎ → „Įsiminti kainą“) arba importuojant.',
      imported: (a: number, tot: number) => `✓ Importuota ${a} kainų (viso bibliotekoje: ${tot})`,
      remove: 'Pašalinti',
      entries: (n: number) => `Įrašų: ${n}`,
      show: 'Rodyti',
      hide: 'Slėpti',
      colName: 'Pavadinimas',
      colUnit: 'Vnt.',
      colPrice: 'Kaina',
      cloudOn: '☁ Sinchronizuojama su paskyra (veikia visuose įrenginiuose)',
      cloudOff: 'Kainos saugomos tik šiame įrenginyje – prisijunkite sinchronizavimui',
    },
    en: {
      title: 'Price library',
      hint: 'Enter a price once — the app suggests it automatically when editing items (carries across projects).',
      import: 'Import Excel/CSV',
      importing: 'Importing…',
      empty: 'Library is empty. Prices are collected via item editing (✎ → “Remember price”) or import.',
      imported: (a: number, tot: number) => `✓ Imported ${a} prices (library total: ${tot})`,
      remove: 'Remove',
      entries: (n: number) => `Entries: ${n}`,
      show: 'Show',
      hide: 'Hide',
      colName: 'Name',
      colUnit: 'Unit',
      colPrice: 'Price',
      cloudOn: '☁ Synced with your account (works on all devices)',
      cloudOff: 'Prices are stored on this device only – sign in to sync',
    },
  });
  const { isAuthenticated } = useAuth();
  const [entries, setEntries] = useState<PriceEntry[]>(loadLibrary);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Atnaujinti sąrašą, kai debesų sinchronizacija sulieja biblioteką
  useEffect(() => {
    const refresh = () => setEntries(loadLibrary());
    window.addEventListener('qto-price-lib-synced', refresh);
    return () => window.removeEventListener('qto-price-lib-synced', refresh);
  }, []);

  const onImport = async (f: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await importPriceFile(f);
      setEntries(loadLibrary());
      setMsg(t.imported(r.added, r.total));
      setOpen(true);
    } catch {
      setMsg('⚠ importas nepavyko');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{t.title}</span>
          <span className="text-xs text-muted-foreground">{t.entries(entries.length)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            {open ? t.hide : t.show}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />{busy ? t.importing : t.import}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{t.hint}</p>
      <p className={`mt-0.5 text-[11px] ${isAuthenticated ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
        {isAuthenticated ? t.cloudOn : t.cloudOff}
      </p>
      {msg && <p className="mt-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">{msg}</p>}
      {open && (
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border">
          {entries.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{t.empty}</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left">{t.colName}</th>
                  <th className="w-16 px-2 py-1.5 text-left">{t.colUnit}</th>
                  <th className="w-24 px-2 py-1.5 text-right">{t.colPrice}</th>
                  <th className="w-10 px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {[...entries].sort((a, b) => a.name.localeCompare(b.name)).map((e) => (
                  <tr key={`${e.name}|${e.unit}`} className="border-t hover:bg-muted/50">
                    <td className="px-2 py-1.5">{e.name}</td>
                    <td className="px-2 py-1.5">{e.unit}</td>
                    <td className="px-2 py-1.5 text-right font-medium">{e.price.toFixed(2)} €</td>
                    <td className="px-2 py-1.5 text-right">
                      <button
                        title={t.remove}
                        onClick={() => setEntries(removeEntry(e.name, e.unit))}
                        className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
