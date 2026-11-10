import { JetBrains_Mono, Manrope, Space_Grotesk } from 'next/font/google';

// The CrossCubes typefaces for every app: a geometric display face, a clean body face and a mono face for numbers.
export const fontDisplay = Space_Grotesk({ subsets: ['latin', 'latin-ext'], weight: ['500', '600', '700'], variable: '--font-display', display: 'swap' });
export const fontSans = Manrope({ subsets: ['latin', 'latin-ext'], variable: '--font-sans', display: 'swap' });
export const fontMono = JetBrains_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

export const fontVariables = `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`;
