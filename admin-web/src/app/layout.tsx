import type { Metadata, Viewport } from 'next';
import { fontDisplay, fontMono, fontSans } from '@/styles/fonts';
import '@/styles/globals.css';
import { Providers } from '@/app/providers';
import { AdminChrome } from './admin-chrome';

/**
 * Root shell for the standalone admin application (port 4005).
 *
 * Reuses the public app's Providers, design tokens and font pairing from
 * ../frontend/src, so the console is identical without a second copy of any of
 * it — but carries NONE of the public marketplace chrome. AdminChrome supplies
 * the back-office frame (topbar, sidebar, server-verified access gate) and
 * leaves the login route bare.
 */

export const metadata: Metadata = {
  title: 'CrossCubes Admin',
  icons: { icon: '/icon.png', shortcut: '/icon.png' },
  // The console must never be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#090b16' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <AdminChrome>{children}</AdminChrome>
        </Providers>
      </body>
    </html>
  );
}
