import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { TRPCProvider } from '@/providers/trpc'
import './index.css'
import App from './App.tsx'
import { applyStoredTheme } from '@/components/ThemeToggle'
import { I18nProvider } from '@/i18n/I18nContext'
import { getLocale } from '@/i18n/store'

applyStoredTheme()
document.documentElement.lang = getLocale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <TRPCProvider>
          <App />
        </TRPCProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
)

// PWA: service worker tik produkcijoje – programos karkasas veikia offline
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}
