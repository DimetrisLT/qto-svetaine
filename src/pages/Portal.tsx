import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Building2, FolderOpen, History, Link2, LogOut, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { trpc } from '@/providers/trpc';
import { LOGIN_PATH } from '@/const';
import ThemeToggle from '@/components/ThemeToggle';
import { LangToggle, useI18n } from '@/i18n/I18nContext';

/** Vartotojo portalas: debesyje išsaugoti projektai */
export default function Portal() {
  const { t, locale } = useI18n();
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
    // Skeleto būsena – vietoj pliko „Kraunama…“
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
            <div className="h-10 w-10 animate-pulse rounded-xl bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-44 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
        <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-3 rounded-xl border p-5">
              <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-8 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Link to="/" className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-tight">{t.portal.title}</h1>
            <p className="text-xs text-muted-foreground">{user.name ?? user.email ?? t.portal.user}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
            <Link
              to="/app"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> {t.portal.newProject}
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <LogOut className="h-3.5 w-3.5" /> {t.portal.logout}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {projects.isLoading && <p className="text-sm text-muted-foreground">{t.portal.loading}</p>}
        {projects.error && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {t.portal.loadError} {projects.error.message}
          </p>
        )}
        {projects.data && projects.data.length === 0 && (
          <div className="rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="mb-2 text-sm font-medium">{t.portal.empty}</p>
            <p className="mb-4 text-xs text-muted-foreground">
              {t.portal.emptyText}
            </p>
            <Link to="/app" className="text-sm font-semibold text-primary hover:underline">
              {t.portal.openApp}
            </Link>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.data?.map((p) => (
            <div key={p.id} className="rounded-xl border p-4 transition-shadow hover:shadow-sm">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-tight">{p.name}</h2>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {p.itemCount} {t.portal.poz}
                </span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                {t.portal.updated} {new Date(p.updatedAt).toLocaleString(locale === 'lt' ? 'lt-LT' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigate(`/app?project=${p.id}`)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <FolderOpen className="h-3.5 w-3.5" /> {t.portal.open}
                </button>
                {shareUrls[p.id] ? (
                  <>
                    <a
                      href={shareUrls[p.id]}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-primary/50 px-3 py-1.5 text-xs font-medium text-primary"
                    >
                      <Link2 className="h-3.5 w-3.5" /> {copiedId === p.id ? t.portal.copied : t.portal.link}
                    </a>
                    <button
                      onClick={() => handleRevoke(p.id)}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
                    >
                      {t.portal.cancel}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleShare(p.id)}
                    disabled={shareCreate.isPending}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5" /> {t.portal.share}
                  </button>
                )}
                <button
                  onClick={() => setHistoryFor(p.id)}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <History className="h-3.5 w-3.5" /> {t.portal.history}
                </button>
                {confirmId === p.id ? (
                  <>
                    <button
                      onClick={() => { remove.mutate({ id: p.id }); setConfirmId(null); }}
                      className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground"
                    >
                      {t.portal.confirmRemove}
                    </button>
                    <button onClick={() => setConfirmId(null)} className="rounded-lg border px-3 py-1.5 text-xs">
                      {t.portal.cancel}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(p.id)}
                    className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t.portal.remove}
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
            <h2 className="mb-1 font-semibold">{t.portal.versions}</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              {t.portal.versionsNote}
            </p>
            {versions.isLoading && <p className="py-4 text-center text-sm text-muted-foreground">{t.app.loading}</p>}
            {versions.data?.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t.portal.versionsEmpty}</p>
            )}
            <div className="max-h-80 space-y-1.5 overflow-auto">
              {versions.data?.map((v, i) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {new Date(v.createdAt).toLocaleString(locale === 'lt' ? 'lt-LT' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}
                      {i === 0 && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{t.portal.current}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{v.itemCount} {t.portal.pozicijos}</p>
                  </div>
                  {i > 0 && (
                    <button
                      onClick={() => restore.mutate({ versionId: v.id })}
                      disabled={restore.isPending}
                      className="rounded-lg border px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      {t.portal.restore}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setHistoryFor(null)}
              className="mt-4 w-full rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              {t.portal.close}
            </button>
          </div>
        </div>
      )}

      <footer className="mx-auto mt-10 max-w-5xl border-t px-4 pt-4 pb-8">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <Link to="/privatumas" className="hover:text-primary">{t.portal.privacy}</Link>
          <Link to="/salygos" className="hover:text-primary">{t.portal.terms}</Link>
          {confirmDelete ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="text-destructive">{t.portal.deleteAsk}</span>
              <button
                onClick={() => deleteMe.mutate()}
                disabled={deleteMe.isPending}
                className="rounded-lg bg-destructive px-3 py-1.5 font-semibold text-destructive-foreground disabled:opacity-50"
              >
                {t.portal.deleteYes}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="rounded-lg border px-3 py-1.5">{t.portal.cancel}</button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-auto text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
            >
              {t.portal.deleteAccount}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
