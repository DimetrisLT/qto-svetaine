import { useState } from 'react';
import { X } from 'lucide-react';
import { CATEGORY_INFO, categoryLabel, type ElementCategory, type QtoItem } from '@/types/qto';
import { useI18n } from '@/i18n/I18nContext';

interface Props {
  item: QtoItem;
  onSave: (patch: Partial<QtoItem>) => void;
  onClose: () => void;
}

const UNITS: QtoItem['unit'][] = ['vnt.', 'm', 'm²', 'm³', 'kg'];
const NUMBER_FIELD_KEYS: Array<'length_m' | 'height_m' | 'thickness_m' | 'width_m'> = ['length_m', 'height_m', 'thickness_m', 'width_m'];

/** Žiniaraščio pozicijos redagavimas po įtraukimo (be permatavimo) */
export default function EditItemDialog({ item, onSave, onClose }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<QtoItem>({ ...item });
  const FIELD_LABELS: Record<string, string> = {
    length_m: `${t.report.fLength}, m`, height_m: `${t.report.fHeight}, m`,
    thickness_m: `${t.report.fThickness}, m`, width_m: `${t.report.fWidth}, m`,
  };

  const num = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border bg-background p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{t.report.editTitle}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <label className="block text-xs">
            {t.report.thName}
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              {t.report.thCat}
              <select
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value as ElementCategory })}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.keys(CATEGORY_INFO).map((k) => (
                  <option key={k} value={k}>{categoryLabel(k as ElementCategory)}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              {t.report.thMat}
              <input
                value={draft.material ?? ''}
                onChange={(e) => setDraft({ ...draft, material: e.target.value || undefined })}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              {t.report.thQty}
              <input
                type="number" step="any"
                value={draft.count}
                onChange={(e) => setDraft({ ...draft, count: Number(e.target.value) })}
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
              />
            </label>
            <label className="block text-xs">
              {t.report.fUnit}
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
            {NUMBER_FIELD_KEYS.map((k) => (
              <label key={k} className="block text-xs">
                {FIELD_LABELS[k]}
                <input
                  type="number" step="any"
                  value={draft[k] ?? ''}
                  onChange={(e) => setDraft({ ...draft, [k]: num(e.target.value) })}
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                />
              </label>
            ))}
          </div>

          <label className="block text-xs">
            {t.report.fNote}
            <input
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value || undefined })}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted">
            {t.pdf.cancel}
          </button>
          <button
            onClick={() => onSave(draft)}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            {t.report.save}
          </button>
        </div>
      </div>
    </div>
  );
}
