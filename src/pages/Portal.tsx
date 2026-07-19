import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, FolderOpen, History, Link2, LogOut, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { LOGIN_PATH } from '@/const';

/** Vartotojo portalas: debesyje išsaugoti projektai */
export default function Portal() {
  const { user, isLoading, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: LOGIN_PATH });
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const projects = trpc.projects.list.useQuery(undefined, { enabled: !!user });
  const remove = trpc.projects.remove.useMutation({
    onSuccess: () => utils.projects.list.invalidate(),
  });
  const deleteMe = trpc.auth.deleteMe.useMutation({
    onSuccess: () => {
      // Kietas peradresavimas – išvalo visą auth būseną nepriklausomai nuo refetch lenktynių
      window.location.href = '/';
    },
  });
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareUrls, setShareUrls] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const shareCreate = trpc.shares.create.useMutation();
  const shareRevoke = trpc.shares.revoke.useMutation();
  // Versijų istorija
  const [historyFor, setHistoryFor] = useState<number | null>(null);
  const versions = trpc.versions.list.useQuery(
    { projectId: historyFor! },
    { enabled: historyFor !== null },
  );
  const restore = trpc.versions.restore.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.versions.list.invalidate();
      setHistoryFor(null);
    },
  });

  const shareUrlFor = (token: string) => `${window.location.origin}/v/${token}`;

  const handleShare = async (projectId: number) => {
    const r = await shareCreate.mutateAsync({ projectId });
    const url = shareUrlFor(r.token);
    setShareUrls((s) => ({ ...s, [projectId]: url }));
    try { await navigator.clipboard.writeText(url); setCopiedId(projectId); setTimeout(() => setCopiedId(null), 2000); } catch { /* clipboard nepasiekiamas */ }
  };

  const handleRevoke = async (projectId: number) => {
    await shareRevoke.mutateAsync({ projectId });
    setShareUrls((s) => { const n = { ...s }; delete n[projectId]; return n; });
  };

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Kraunama…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">Mano projektai</h1>
            <p className="text-xs text-muted-foreground">{user.name ?? user.email ?? 'Vartotojas'}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              to="/app"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Naujas projektas
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5" /> Atsijungti
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {projects.isLoading && <p className="text-sm text-muted-foreground">Kraunami projektai…</p>}
        {projects.error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Nepavyko užkrauti projektų: {projects.error.message}
          </p>
        )}
        {projects.data && projects.data.length === 0 && (
          <div className="rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="mb-2 text-sm font-medium">Dar neturite išsaugotų projektų</p>
            <p className="mb-4 text-xs text-muted-foreground">
              Atidarykite programą, atlikite matavimus ir spauskite „Įrašyti į paskyrą“ – projektas atsiras čia.
            </p>
            <Link to="/app" className="text-sm font-semibold text-primary hover:underline">
              Atidaryti QTO programą →
            </Link>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.data?.map((p) => (
            <div key={p.id} className="rounded-xl border p-4 transition-shadow hover:shadow-sm">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-tight">{p.name}</h2>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {p.itemCount} poz.
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                Atnaujinta {new Date(p.updatedAt).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate(`/app?project=${p.id}`)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> Atidaryti
                </button>
                {shareUrls[p.id] ? (
                  <>
                    <a
                      href={shareUrls[p.id]}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-primary/50 px-3 py-1.5 text-xs font-medium text-primary"
                    >
                      <Link2 className="h-3.5 w-3.5" /> {copiedId === p.id ? '✓ Nukopijuota' : 'Nuoroda'}
                    </a>
                    <button
                      onClick={() => handleRevoke(p.id)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
                    >
                      Atšaukti
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleShare(p.id)}
                    disabled={shareCreate.isPending}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5" /> Dalintis peržiūra
                  </button>
                )}
                <button
                  onClick={() => setHistoryFor(p.id)}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <History className="h-3.5 w-3.5" /> Istorija
                </button>
                {confirmId === p.id ? (
                  <>
                    <button
                      onClick={() => { remove.mutate({ id: p.id }); setConfirmId(null); }}
                      className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
                    >
                      Patvirtinti šalinimą
                    </button>
                    <button onClick={() => setConfirmId(null)} className="rounded-lg border px-3 py-1.5 text-xs">
                      Atšaukti
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(p.id)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Šalinti
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Versijų istorijos dialogas */}
      {historyFor !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setHistoryFor(null)}>
          <div className="w-full max-w-md rounded-xl bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-1 font-semibold">Versijų istorija</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Momentinė kopija sukuriama kaskart įrašant projektą (laikomos paskutinės 20).
            </p>
            {versions.isLoading && <p className="py-4 text-center text-sm text-muted-foreground">Kraunama…</p>}
            {versions.data?.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Versijų dar nėra.</p>
            )}
            <div className="max-h-80 space-y-1.5 overflow-auto">
              {versions.data?.map((v, i) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {new Date(v.createdAt).toLocaleString('lt-LT', { dateStyle: 'short', timeStyle: 'short' })}
                      {i === 0 && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">dabartinė</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{v.itemCount} pozicijos</p>
                  </div>
                  {i > 0 && (
                    <button
                      onClick={() => restore.mutate({ versionId: v.id })}
                      disabled={restore.isPending}
                      className="rounded-lg border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      Atkurti
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setHistoryFor(null)}
              className="mt-4 w-full rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              Uždaryti
            </button>
          </div>
        </div>
      )}

      <footer className="mx-auto mt-10 max-w-5xl border-t px-4 pt-4 pb-8">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <Link to="/privatumas" className="hover:text-primary">Privatumo politika</Link>
          <Link to="/salygos" className="hover:text-primary">Naudojimo sąlygos</Link>
          {confirmDelete ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="text-destructive">Ištrinti paskyrą ir visus projektus negrįžtamai?</span>
              <button
                onClick={() => deleteMe.mutate()}
                disabled={deleteMe.isPending}
                className="rounded-lg bg-destructive px-3 py-1.5 font-semibold text-destructive-foreground disabled:opacity-50"
              >
                Taip, ištrinti viską
              </button>
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg border px-3 py-1.5">Atšaukti</button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-auto text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            >
              Ištrinti paskyrą
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
