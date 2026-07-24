import { useEffect, useRef } from 'react';
import { trpc } from '@/providers/trpc';
import { useAuth } from '@/hooks/useAuth';
import { loadLibrary, saveLibrary, mergeLibraries } from '@/lib/priceLibrary';

/**
 * Dvikryptis įkainių bibliotekos sinchronizavimas su paskyra:
 * - prisijungus: paimama debesies biblioteka, suliejama su vietine (naujesnis laimi),
 *   rezultatas išsaugomas vietoje ir nusiunčiamas atgal į debesį;
 * - kaskart pakeitus biblioteką (įsiminta kaina, importas, trynimas): po 2 s pristumiama.
 * Neprisijungus ar be interneto – viskas lieka localStorage (atsarginis variantas).
 */
export function usePriceLibrarySync() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = useRef(false);

  // Pradinė sinchronizacija prisijungus
  useEffect(() => {
    if (!isAuthenticated || ready.current) return;
    ready.current = true;
    (async () => {
      try {
        const cloud = await utils.priceLib.list.fetch();
        const merged = mergeLibraries(loadLibrary(), cloud);
        saveLibrary(merged);
        await utils.priceLib.sync.mutate({
          entries: merged.map((e) => ({ name: e.name, unit: e.unit, price: e.price, note: e.note })),
        });
        window.dispatchEvent(new CustomEvent('qto-price-lib-synced'));
      } catch {
        // be tinklo / klaida – lieka vietinė kopija
      }
    })();
  }, [isAuthenticated, utils]);

  // Pristūmimas po kiekvieno pakeitimo (debounce 2 s)
  useEffect(() => {
    if (!isAuthenticated) return;
    const push = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          const lib = loadLibrary();
          await utils.priceLib.sync.mutate({
            entries: lib.map((e) => ({ name: e.name, unit: e.unit, price: e.price, note: e.note })),
          });
        } catch { /* tyla – kitą kartą */ }
      }, 2000);
    };
    window.addEventListener('qto-price-lib-changed', push);
    return () => {
      window.removeEventListener('qto-price-lib-changed', push);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [isAuthenticated, utils]);
}
