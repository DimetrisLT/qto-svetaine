import { useState } from 'react';
import { X } from 'lucide-react';
import { CATEGORY_INFO, type ElementCategory, type QtoItem } from '@/types/qto';

interface Props {
  item: QtoItem;
  onSave: (patch: Partial<QtoItem>) => void;
  onClose: () => void;
}

const UNITS: QtoItem['unit'][] = ['vnt.', 'm', 'm²', 'm³', 'kg'];
const NUMBER_FIELDS: Array<{ key: 'length_m' | 'height_m' | 'thickness_m' | 'width_m'; label: string }> = [
  { key: 'length_m', label: 'Ilgis, m' },
  { key: 'height_m', label: 'Aukštis, m' },
  { key: 'thickness_m', label: 'Storis, m' },
  { key: 'width_m', label: 'Plotis, m' },
];

/** Žiniaraščio pozicijos redagavimas po įtraukimo (be permatavimo) */
export default function EditItemDialog({ item, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<QtoItem>({ ...item });

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">Redaguoti poziciją</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block text-xs">
            Pavadinimas
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              Kategorija
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ElementCategory })}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(CATEGORY_INFO).map(([k, v]) => (
                  <option key={k} value={k}>{v.lt}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              Medžiaga
              <input
                value={draft.material ?? ''}
                onChange={(e) => setDraft({ ...draft, material: e.target.value || undefined })}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              Kiekis
              <input
                type="number" step="any"
                value={draft.count}
                onChange={(e) => setDraft({ ...draft, count: Number(e.target.value) })}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              Vienetas
              <select
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value as QtoItem['unit'] })}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {NUMBER_FIELDS.map((f) => (
              <label key={f.key} className="block text-xs">
                {f.label}
                <input
                  type="number" step="any"
                  value={draft[f.key] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [f.key]: num(e.target.value) })}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </label>
            ))}
          </div>

          <label className="block text-xs">
            Pastaba
            <input
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value || undefined })}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
            Atšaukti
          </button>
          <button
            onClick={() => onSave(draft)}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Išsaugoti
          </button>
        </div>
      </div>
    </div>
  );
}
