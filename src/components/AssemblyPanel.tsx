import { useMemo, useState } from 'react';
import { Layers, PlusCircle } from 'lucide-react';
import { ASSEMBLY_TEMPLATES, applyAssembly, canApply } from '@/lib/assemblies';
import { fmt } from '@/lib/format';
import type { QtoItem } from '@/types/qto';

interface Props {
  items: QtoItem[];
  onAdd: (lines: QtoItem[]) => void;
}

/** Kompozitiniai darbai: vienas matavimas → kelios žiniaraščio eilutės (betonas, kofanas, armatūra, apdaila) */
export default function AssemblyPanel({ items, onAdd }: Props) {
  const [templateId, setTemplateId] = useState(ASSEMBLY_TEMPLATES[0].id);
  const [sourceId, setSourceId] = useState('');
  const [params, setParams] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState(false);

  const template = ASSEMBLY_TEMPLATES.find((t) => t.id === templateId)!;
  const candidates = useMemo(() => items.filter((i) => canApply(template, i)), [items, template]);
  const source = candidates.find((i) => i.id === sourceId) ?? candidates[0];

  const effectiveParams = useMemo(() => {
    const p: Record<string, number> = {};
    for (const d of template.params) p[d.key] = params[`${templateId}.${d.key}`] ?? d.def;
    return p;
  }, [template, params, templateId]);

  const preview = useMemo(
    () => (source ? applyAssembly(template, source, effectiveParams) : []),
    [source, template, effectiveParams],
  );

  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border p-4">
      <div className="mb-1 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Kompozitiniai darbai</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Vienas matavimas → kelios žiniaraščio eilutės: betonas, kofanas, armatūra, apdaila. Kiekviena eilutė rodo formulę.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs">
          <span className="mb-1 block font-medium">Darbo šablonas</span>
          <select
            value={templateId}
            onChange={(e) => { setTemplateId(e.target.value); setSourceId(''); }}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {ASSEMBLY_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[220px] flex-1 text-xs">
          <span className="mb-1 block font-medium">Šaltinio matavimas ({template.requires === 'length' ? 'ilgis' : 'plotas'})</span>
          <select
            value={source?.id ?? ''}
            onChange={(e) => setSourceId(e.target.value)}
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          >
            {candidates.length === 0 && <option value="">— nėra tinkamų matavimų —</option>}
            {candidates.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {template.requires === 'length' ? `${fmt(i.length_m)} m` : `${fmt(i.area_m2)} m²`}
              </option>
            ))}
          </select>
        </label>

        {template.params.map((p) => (
          <label key={p.key} className="text-xs">
            <span className="mb-1 block font-medium">{p.label}, {p.unit}</span>
            <input
              type="number"
              step={p.step ?? 0.05}
              min={p.min}
              max={p.max}
              value={effectiveParams[p.key]}
              onChange={(e) => setParams((s) => ({ ...s, [`${templateId}.${p.key}`]: Number(e.target.value) }))}
              className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
            />
          </label>
        ))}
      </div>

      {source && preview.length > 0 && (
        <>
          <table className="mt-3 w-full text-xs">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Eilutė</th>
                <th className="py-1 pr-2 text-right font-medium">Kiekis</th>
                <th className="py-1 font-medium">Formulė</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-1 pr-2">{l.name}</td>
                  <td className="py-1 pr-2 text-right font-semibold">{fmt(l.count)} {l.unit}</td>
                  <td className="py-1 text-muted-foreground">{l.note?.replace(/^Išvestinė eilutė \([^)]*\): /, '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => { onAdd(preview); setFlash(true); setTimeout(() => setFlash(false), 2000); }}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            {flash ? `✓ Įtraukta ${preview.length} eil.` : `Įtraukti ${preview.length} eilutes į žiniaraštį`}
          </button>
        </>
      )}
      {!source && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          Šiam šablonui reikia išmatuoto {template.requires === 'length' ? 'ilgio' : 'ploto'} – pirmiausia atlikite matavimą PDF arba IFC skiltyje.
        </p>
      )}
    </div>
  );
}
