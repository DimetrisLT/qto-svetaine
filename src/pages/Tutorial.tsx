import { Link } from 'react-router';
import { ArrowLeft, ArrowRight, Crosshair, PlayCircle } from 'lucide-react';
import { LangToggle, useI18n } from '@/i18n/I18nContext';
import ThemeToggle from '@/components/ThemeToggle';

/** Mokymo puslapis: video įrašas + žingsnis po žingsnio instrukcija (LT/EN) */
export default function Tutorial() {
  const { t, locale } = useI18n();
  const videoSrc = locale === 'lt' ? '/tutorial/qto-tutorial-lt.mp4' : '/tutorial/qto-tutorial-en.mp4';
  const vttSrc = locale === 'lt' ? '/tutorial/qto-tutorial-lt.vtt' : '/tutorial/qto-tutorial-en.vtt';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-600 text-white">
            <Crosshair className="h-4.5 w-4.5" />
          </Link>
          <span className="text-sm font-bold">{t.tut.title}</span>
          <div className="ml-auto flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
            <Link
              to="/app"
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              {t.tut.back} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-600 dark:text-sky-300">
            <PlayCircle className="h-3.5 w-3.5" /> {t.tut.badge}
          </span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{t.tut.title}</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{t.tut.sub}</p>
        </div>

        {/* Video */}
        <div className="overflow-hidden rounded-2xl border shadow-lg">
          <video key={videoSrc} controls preload="metadata" poster="/tutorial/poster.jpg" className="aspect-video w-full bg-black">
            <source src={videoSrc} type="video/mp4" />
            <track kind="captions" src={vttSrc} srcLang={locale} label={locale === 'lt' ? 'Lietuvių' : 'English'} default />
          </video>
        </div>

        {/* Žingsniai */}
        <ol className="mt-8 grid gap-3 sm:grid-cols-2">
          {t.tut.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3.5 rounded-xl border bg-card p-4">
              <span className="font-dim flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600/15 text-sm font-bold text-sky-600 dark:text-sky-300">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-sky-400/30 bg-sky-400/5 p-6 text-center">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-500"
          >
            {t.tut.cta} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> {t.login.toSite}
          </Link>
        </div>
      </main>
    </div>
  );
}
