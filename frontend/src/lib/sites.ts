import { api } from '@/lib/api/client';
import { tokenStore } from '@/lib/api/token-store';

const DEV = process.env.NODE_ENV !== 'production';
const origin = (value: string | undefined, dev: string, prod: string) => (value ?? (DEV ? dev : prod)).replace(/\/$/, '');

/** The guest website (crosscubes.com). */
export const GUEST_SITE = origin(process.env.NEXT_PUBLIC_SITE_URL, 'http://localhost:3000', 'https://www.crosscubes.com');

/** Host and captain pages live in the hub portal; there is no separate host site. */
export const HOST_SITE = origin(process.env.NEXT_PUBLIC_HOST_URL ?? process.env.NEXT_PUBLIC_CROSSCUBES_HUB_URL, 'http://localhost:3030', 'https://hub.crosscubes.com');

/** The partner website: the Asset Partner portal. */
export const PARTNER_SITE = origin(process.env.NEXT_PUBLIC_PARTNER_URL, 'http://localhost:3010', 'https://partners.crosscubes.com');

/** The hub portal licence holders sign in to. */
export const IOC_SITE = origin(process.env.NEXT_PUBLIC_CROSSCUBES_HUB_URL, 'http://localhost:3030', 'https://hub.crosscubes.com');

export type Site = 'guest' | 'host' | 'partner' | 'ioc';

const ORIGIN: Record<Site, string> = { guest: GUEST_SITE, host: HOST_SITE, partner: PARTNER_SITE, ioc: IOC_SITE };

// Which site serves a path; kept in step with HOST_SECTIONS / PARTNER_SECTIONS in next.config.mjs and backend site-links.ts.
const HOST_PATH = /^\/(host|captain)(\/|\?|$)/;
const PARTNER_PATH = /^\/asset-partners\/(dashboard|vehicles|statements|maintenance|documents|profile)(\/|\?|$)/;

export function siteForPath(path: string): Site {
  if (HOST_PATH.test(path)) return 'host';
  if (PARTNER_PATH.test(path)) return 'partner';
  return 'guest';
}

/** A path on one of the sites; relative paths only, so it can never be pointed elsewhere. */
export const siteUrl = (site: Site, path = '/') => `${ORIGIN[site]}${path.startsWith('/') ? path : `/${path}`}`;

// Carries the session as a one-time code in the URL fragment, which never reaches a server log.
export async function goToSite(site: Site, path = '/'): Promise<void> {
  const target = siteUrl(site, path);
  if (!tokenStore.getAccess()) {
    window.location.assign(target);
    return;
  }
  try {
    const { code } = await api.post<{ code: string }>('/auth/handoff');
    const params = new URLSearchParams({ code, next: path });
    window.location.assign(`${siteUrl(site, '/handoff')}#${params.toString()}`);
  } catch {
    // The other site still works; the person signs in there.
    window.location.assign(target);
  }
}

/** Only a same-site path is accepted as the place to land after a handoff. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  return next;
}
