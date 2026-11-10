import type { Metadata, Viewport } from 'next';
import { fontDisplay, fontMono, fontSans } from '@/styles/fonts';
import '@/styles/globals.css';
import { Providers } from '@/app/providers';
import { IocChrome } from './ioc-chrome';


export const metadata: Metadata = {
  title: { default: 'CrossCubes Hub', template: '%s · CrossCubes Hub' },
  description: 'CrossCubes operations: our vehicles, trips and Asset Partners.',
  applicationName: 'CrossCubes Hub',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.png', shortcut: '/icon.png', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#090b16' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}>
      <body className="flex min-h-screen flex-col overflow-x-clip font-sans antialiased">
        <Providers>
          <IocChrome>{children}</IocChrome>
        </Providers>
      </body>
    </html>
  );
}
