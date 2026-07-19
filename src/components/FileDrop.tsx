import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileCheck2, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  accept: string;
  label: string;
  hint?: string;
  fileName?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  /** Pavyzdinis failas „Išbandyti su pavyzdžiu“ – padeda pradėti naujams vartotojams */
  sample?: { url: string; fileName: string };
}

export default function FileDrop({ accept, label, hint, fileName, disabled, onFile, sample }: Props) {
  const [over, setOver] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback((files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  const loadSample = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!sample || sampleLoading) return;
    setSampleLoading(true);
    try {
      const res = await fetch(sample.url);
      const blob = await res.blob();
      onFile(new File([blob], sample.fileName, { type: blob.type }));
    } finally {
      setSampleLoading(false);
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) handle(e.dataTransfer.files); }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
          over ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/60',
          disabled && 'opacity-50 pointer-events-none',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handle(e.target.files)}
        />
        {fileName ? (
          <>
            <FileCheck2 className="h-10 w-10 text-emerald-500" />
            <p className="font-medium">{fileName}</p>
            <p className="text-xs text-muted-foreground">Spauskite, kad pasirinktumėte kitą failą</p>
          </>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">{label}</p>
            {hint && <p className="text-xs text-muted-foreground max-w-md">{hint}</p>}
          </>
        )}
      </div>
      {sample && !fileName && (
        <button
          onClick={loadSample}
          disabled={sampleLoading}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          {sampleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Išbandyti su pavyzdžiu – be savo failo
        </button>
      )}
    </div>
  );
}
