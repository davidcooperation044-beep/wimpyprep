import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import { SessionProvider } from '../lib/session-bootstrap';
import ServiceWorkerRegister from './components/service-worker-register';
import ThemeToggle from './components/theme-toggle';

export const metadata: Metadata = {
  title: 'WimpyPrep',
  description: 'JAMB and WAEC exam prep with practice, mock exams, and AI insights.',
  manifest: '/manifest.json',
};

const themeInit = `
(function() {
  try {
    var stored = window.localStorage.getItem('wimpyTheme');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
    document.documentElement.dataset.theme = theme;
  } catch (error) {
    console.error(error);
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <SessionProvider>
          <ServiceWorkerRegister />
          <header className="site-header">
            <div className="brand-row">
              <a href="/" className="brand">WimpyPrep</a>
            </div>
            <div className="nav-actions">
              <ThemeToggle />
            </div>
          </header>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
