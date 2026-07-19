import { useState } from 'react';
import FileDrop from '@/components/FileDrop';
import PdfViewer from '@/components/PdfViewer';
import type { QtoItem, SourceMeta } from '@/types/qto';

interface Props {
  fileName?: string;
  items: QtoItem[];
  onData: (items: QtoItem[], meta: SourceMeta) => void;
}

export default function PdfSection({ fileName, items, onData }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState(fileName);

  const handleFile = (f: File) => {
    setFile(f);
    setName(f.name);
    onData([], { source: 'PDF', fileName: f.name, parsed: true, scaleCalibrated: false });
  };

  return (
    <div className="space-y-4">
      {!file ? (
        <FileDrop
          accept=".pdf"
          label="Įkelkite PDF brėžinį"
          hint="Pusiau automatinis režimas: sukalibruojate mastelį dviem taškais, o programa skaičiuoja ilgius, plotus ir tūrius pagal jūsų pažymėtas linijas ir kontūrus."
          fileName={name}
          onFile={handleFile}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{name}</span>
            <button
              onClick={() => { setFile(null); setName(undefined); onData([], { source: 'PDF', parsed: false }); }}
              className="rounded-lg border px-2.5 py-1 text-xs hover:bg-muted"
            >
              Kitas failas
            </button>
          </div>
          <PdfViewer
            file={file}
            items={items}
            onChange={(next, m) => onData(next, { source: 'PDF', fileName: name, parsed: true, scaleCalibrated: m.scaleCalibrated })}
          />
        </>
      )}
    </div>
  );
}
