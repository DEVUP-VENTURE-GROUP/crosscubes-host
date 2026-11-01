'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { NotificationBell } from '@/components/layout/notification-bell';
import { iocNotificationLink } from '~/features/notifications/ioc-link';
import { HostMobileTabBar } from '~/components/layout/host-mobile-tab-bar';
import { RouteProgress } from '@/components/layout/route-progress';
import { PageTransition } from '@/components/layout/page-transition';
import { useAuthStore } from '@/features/auth/store';
import { useLogout } from '@/features/auth/hooks';
import { useIsHost } from '~/features/host/hooks';
import { captainApi } from '~/features/host/team-api';
import { cn } from '@/lib/utils/cn';
import { api } from '@/lib/api/client';
import { formatDate } from '@/lib/utils/format';
import { LICENCE_LABEL, type HubStatus, type LicenceKind } from '@/features/hubs/types';

interface MyHub {
  id: string;
  code: string;
  name: string;
  status: HubStatus;
  launchBlockers: string[];
  pauseReason?: string;
  licences: { id: string; kind: LicenceKind; label: string; expiresAt?: string }[];
}

const SOON = 30 * 86_400_000;

/** Tells the franchisee, above every page, when guests can't book them or a licence is about to lapse. */
function HubStatusBanner({ hub }: { hub: MyHub }) {
  const expiring = hub.licences.filter((l) => l.expiresAt && new Date(l.expiresAt).getTime() - Date.now() <= SOON);
  if (hub.status === 'live' && expiring.length === 0) return null;
  const warn = hub.status === 'paused' || expiring.some((l) => new Date(l.expiresAt!).getTime() <= Date.now());
  return (
    <div role="status" className={cn('mb-6 rounded-lg border p-4 text-sm', warn ? 'border-warning/40 bg-warning/5' : 'border-border bg-subtle')}>
      {hub.status === 'setup' && (
        <>
          <p className="font-semibold">{hub.name} isn’t live yet. Guests can’t book your cars until HQ finishes the launch checklist.</p>
          {hub.launchBlockers.length > 0 && <ul className="mt-2 list-disc space-y-1 ps-5 text-muted-foreground">{hub.launchBlockers.map((b) => <li key={b}>{b}</li>)}</ul>}
        </>
      )}
      {hub.status === 'paused' && <p className="font-semibold">{hub.name} is paused, so guests can’t book right now.{hub.pauseReason ? ` HQ’s note: ${hub.pauseReason}` : ''}</p>}
      {expiring.map((l) => (
        <p key={l.id} className={hub.status === 'live' ? 'font-semibold' : 'mt-2'}>
          {LICENCE_LABEL[l.kind]} “{l.label}” {new Date(l.expiresAt!).getTime() <= Date.now() ? 'has expired' : 'expires'} on {formatDate(l.expiresAt!)}. Send HQ the renewal.
        </p>
      ))}
    </div>
  );
}

// Full-screen pages: sign-in, the cross-site handoff, House Fleet's bridge and a captain's invite.
const BARE = ['/sign-in', '/handoff', '/captain/accept-invite'];

/** CatoDrive's operations panel frame: Host and Captain when the account is both, a way back to catodrive.com, and sign out. */
export function IocChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const isHost = useIsHost();
  const captain = useQuery({ queryKey: ['captain-queue'], queryFn: () => captainApi.queue(), enabled: signedIn, retry: false });
  const hub = useQuery({ queryKey: ['my-hub'], queryFn: () => api.get<MyHub>('/ioc/hub'), enabled: signedIn && isHost, retry: false, staleTime: 60_000 });
  const logout = useLogout();

  if (BARE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">{children}</main>;
  }

  const inHost = pathname === '/ops' || pathname.startsWith('/ops/');
  const sections = [
    ...(isHost ? [{ href: '/ops', label: 'Operations' }] : []),
    ...(captain.data ? [{ href: '/captain', label: 'Captain' }] : []),
  ];
  const showNav = signedIn && sections.length > 1;
  const tab = (s: { href: string; label: string }, base: string) => {
    const on = pathname === s.href || pathname.startsWith(`${s.href}/`);
    return (
      <Link key={s.href} href={s.href} className={cn(base, on ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
        {s.label}
      </Link>
    );
  };

  return (
    <>
      <RouteProgress />
      <header className="fixed inset-x-4 top-4 z-50 mx-auto max-w-7xl rounded-2xl border border-white/10 bg-background/60 shadow-xl shadow-black/10 backdrop-blur-2xl">
        <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <Logo className="h-9 w-9 shrink-0" />
            <span className="display text-xl tracking-tight">CatoDrive</span>
            <span className="hidden rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-primary sm:inline">
              {hub.data ? `${hub.data.code} · ${hub.data.name}` : 'Hub'}
            </span>
          </Link>
          {showNav && (
            <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
              {sections.map((s) => tab(s, 'rounded-full px-3 py-1.5 text-sm font-medium transition-colors'))}
            </nav>
          )}
          <div className="flex items-center gap-1 sm:gap-2">
            {signedIn && <NotificationBell linkFor={iocNotificationLink} />}
            {signedIn && (
              <button type="button" onClick={() => logout.mutate()} aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-full hover:bg-accent">
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {showNav && (
          <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden" aria-label="Sections">
            {sections.map((s) => tab(s, 'shrink-0 rounded-full px-3 py-1 text-xs font-medium'))}
          </nav>
        )}
      </header>
      <main className={cn('mx-auto w-full max-w-7xl flex-1 px-4 pb-8 sm:px-6', showNav ? 'pt-32 md:pt-24' : 'pt-24')}>
        {inHost && hub.data && <HubStatusBanner hub={hub.data} />}
        <PageTransition>{children}</PageTransition>
      </main>
      {isHost && inHost ? <HostMobileTabBar /> : null}
    </>
  );
}
