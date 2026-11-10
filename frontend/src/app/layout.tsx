import type { Metadata, Viewport } from 'next';
import { fontDisplay, fontMono, fontSans } from '@/styles/fonts';
import '@/styles/globals.css';
import { Providers } from './providers';
import { AppChrome } from '@/components/layout/app-chrome';


/*
 * Owned, on-brand metadata for CrossCubes.
 *
 * Every field is filled with the product's own identity rather than left to a
 * framework default, so search engines, link previews and site scanners see
 * "CrossCubes", not a generic scaffold. Nothing here advertises the build tool
 * (and poweredByHeader is off in next.config, so no X-Powered-By header ships).
 */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.crosscubes.com';
// The company name, not a runtime config value - hardcoded so it can never
// drift from whatever NEXT_PUBLIC_APP_NAME happens to be set to in a given
// environment (this is exactly how it once rendered "CATO Drive" in
// production: the env var was "CATO", and " Drive" got appended onto it).
const BRAND = 'CrossCubes';
const TAGLINE = `${BRAND} - cars, city by city`;
const DESCRIPTION =
  `${BRAND} is a city-by-city car rental network from CatoDrive, Inc.: book a car run by your local team, ` +
  `or put the car you own to work as an Asset Partner.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TAGLINE,
    template: `%s · ${BRAND}`,
  },
  description: DESCRIPTION,
  applicationName: BRAND,
  authors: [{ name: BRAND, url: SITE_URL }],
  creator: BRAND,
  publisher: BRAND,
  // Don't announce the generator/build tool.
  generator: null,
  keywords: [
    'CrossCubes', 'car rental', 'rent a car', 'peer to peer car rental',
    'car sharing', 'book a car', 'local car rental', 'host your car', 'car hire',
  ],
  category: 'travel',
  referrer: 'strict-origin-when-cross-origin',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  icons: { icon: '/icon.png', shortcut: '/icon.png', apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
  // Makes iOS treat an added-to-home-screen CrossCubes like a standalone app.
  appleWebApp: { capable: true, title: 'CrossCubes', statusBarStyle: 'default' },
  openGraph: {
    type: 'website',
    siteName: BRAND,
    title: TAGLINE,
    description: DESCRIPTION,
    url: SITE_URL,
    images: [{ url: '/logos/crosscubes-og.png', width: 1200, height: 630, alt: BRAND }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TAGLINE,
    description: DESCRIPTION,
    images: ['/logos/crosscubes-og.png'],
  },
};

export const viewport: Viewport = {
  /*
   * Pinch-zoom stays available.
   *
   * This previously set maximumScale:1 / userScalable:false to make the page
   * feel app-like. That is a WCAG 1.4.4 failure: someone who needs to magnify
   * a licence plate, a price breakdown or a pickup address simply could not.
   * The horizontal-pan problem it was really solving is handled properly by
   * overflow-x on the document, not by taking zoom away from everyone.
   */
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f9fc' }, // --background
    { media: '(prefers-color-scheme: dark)', color: '#090b16' }, // --background (dark)
  ],
};

import { LenisProvider } from '@/components/providers/lenis-provider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      dir="ltr"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontMono.variable}`}
    >
      <body className="flex min-h-screen flex-col font-sans antialiased overflow-x-clip">
        <LenisProvider>
          <Providers>
            {/* Consumer chrome for the marketplace; the admin console supplies
                its own shell (see AppChrome). */}
            <AppChrome>{children}</AppChrome>
          </Providers>
        </LenisProvider>
      </body>
    </html>
  );
}
