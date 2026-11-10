'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, Building2, Car, ClipboardCheck, KeyRound, LineChart, MapPin, ShieldCheck, Box, Users } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BRAND } from '@/features/marketing/sections';
import { useAuthStore } from '@/features/auth/store';
import { HubApplyForm } from '@/features/hubs/apply-form';
import { hubApplicationsApi } from '@/features/hubs/applications-api';
import { useLiveHubs } from '@/features/hubs/api';
import { formatMoney } from '@/lib/utils/format';

const STEPS = [
  { icon: ClipboardCheck, title: 'Apply', body: 'Tell us about you and the city you want to run. It takes about five minutes and costs nothing.' },
  { icon: BadgeCheck, title: 'Get approved', body: 'Our team reviews every application and calls you. We agree your area so no one else runs it.' },
  { icon: KeyRound, title: 'Pay your licence', body: 'Pay the yearly city licence online. Your hub portal opens the moment it goes through.' },
  { icon: Car, title: 'Go live', body: 'Bring on local car owners, add your insurance, and HQ switches your city on for guests.' },
];

const YOU = ['Find and sign up local car owners as partners', 'Keep cars clean, delivered and on time', 'Look after guests in your city', 'Keep your insurance and licences in date'];
const US = ['The booking site and apps guests already use', 'Payments, payouts, ID checks and fraud checks', 'Pricing, marketing and support behind you', 'Your hub portal with live numbers for your city'];

const pct = (bps: number) => `${Number((bps / 100).toFixed(1))}%`;

export default function RunACityPage() {
  const status = useAuthStore((s) => s.status);
  const terms = useQuery({ queryKey: ['licence-terms'], queryFn: hubApplicationsApi.terms, staleTime: 5 * 60_000 });
  const mine = useQuery({ queryKey: ['my-hub-application'], queryFn: hubApplicationsApi.mine, enabled: status === 'authenticated' });
  const live = useLiveHubs();
  const t = terms.data;
  const open = mine.data && ['submitted', 'approved', 'paid'].includes(mine.data.status);

  return (
    <div className="space-y-20 pb-20">
      <section className="full-bleed relative isolate overflow-hidden hero-mesh">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-14 sm:px-6 sm:pb-28 sm:pt-20">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
              <Box className="h-3.5 w-3.5" aria-hidden /> City licence
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display mt-6 max-w-3xl text-[2.4rem] leading-[0.98] text-white sm:text-[3.6rem] lg:text-[4.4rem]">Run {BRAND} in your city.</h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/70 sm:text-xl">
              You run the cars on the ground. We bring the platform, the guests, the payments and the support. You earn a share of every trip in your area.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap gap-4">
              <a href="#apply" className="group inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-95 sm:h-14 sm:px-7 sm:text-base">
                Apply for your city <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </a>
              <a href="#money" className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 text-sm font-bold text-white backdrop-blur hover:bg-white/10 sm:h-14 sm:px-7 sm:text-base">How the money works</a>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
        <h2 className="display text-3xl">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary"><s.icon className="h-5 w-5" aria-hidden /></span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {i + 1}</span>
                  </div>
                  <h3 className="text-base font-semibold">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section id="money" className="mx-auto max-w-6xl scroll-mt-24 space-y-8 px-4 sm:px-6">
        <div className="max-w-2xl space-y-2">
          <h2 className="display text-3xl">How the money works</h2>
          <p className="text-muted-foreground">Every trip in your city is split three ways. These are the current terms; we confirm yours when you’re approved.</p>
        </div>
        {!t ? (
          terms.isError ? (
            <p className="text-sm text-muted-foreground">We couldn’t load the current terms. Refresh to try again.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-lg" />)}</div>
          )
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card><CardContent className="space-y-2 p-6"><Users className="h-5 w-5 text-primary" aria-hidden /><p className="text-3xl font-bold tabular-nums">{pct(t.partnerShareBps)}</p><p className="text-sm font-semibold">to the car’s owner</p><p className="text-sm text-muted-foreground">Local owners you sign up as Asset Partners keep most of what their car earns.</p></CardContent></Card>
              <Card className="border-primary/40 bg-primary/5"><CardContent className="space-y-2 p-6"><MapPin className="h-5 w-5 text-primary" aria-hidden /><p className="text-3xl font-bold tabular-nums">{pct(t.holderShareBps)}</p><p className="text-sm font-semibold">to you, the licence holder</p><p className="text-sm text-muted-foreground">On every paid trip in your area, paid out monthly.</p></CardContent></Card>
              <Card><CardContent className="space-y-2 p-6"><Building2 className="h-5 w-5 text-primary" aria-hidden /><p className="text-3xl font-bold tabular-nums">{pct(10_000 - t.partnerShareBps - t.holderShareBps)}</p><p className="text-sm font-semibold">to {BRAND}</p><p className="text-sm text-muted-foreground">For the platform, payments, marketing and support.</p></CardContent></Card>
            </div>
            <p className="rounded-lg border border-border bg-subtle p-4 text-sm">
              The city licence is <span className="font-semibold tabular-nums">{formatMoney({ amount: t.licenceFeeCents, currency: t.currency })}</span> for {t.termMonths} months. You pay it only after we approve you, and you renew it each year to keep your area.
            </p>
          </>
        )}
      </section>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 lg:grid-cols-2">
        <Card><CardContent className="space-y-4 p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><Car className="h-5 w-5 text-primary" aria-hidden /> What you do</h2><ul className="space-y-2 text-sm">{YOU.map((x) => <li key={x} className="flex gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{x}</li>)}</ul></CardContent></Card>
        <Card><CardContent className="space-y-4 p-6"><h2 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> What we do</h2><ul className="space-y-2 text-sm">{US.map((x) => <li key={x} className="flex gap-2"><LineChart className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{x}</li>)}</ul></CardContent></Card>
      </section>

      {(live.data?.length ?? 0) > 0 && (
        <section className="mx-auto max-w-6xl space-y-3 px-4 sm:px-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cities already live</h2>
          <ul className="flex flex-wrap gap-2">{live.data!.map((h) => <li key={h.id} className="rounded-full border border-border px-3 py-1 text-sm">{h.name}, {h.state}</li>)}</ul>
          <p className="text-xs text-muted-foreground">These areas are taken. Pick another city.</p>
        </section>
      )}

      <section id="apply" className="mx-auto max-w-3xl scroll-mt-24 px-4 sm:px-6">
        <Card>
          <CardContent className="space-y-6 p-6 sm:p-8">
            <div className="space-y-1">
              <h2 className="display text-2xl">Apply for your city</h2>
              <p className="text-sm text-muted-foreground">We reply to every application.</p>
            </div>
            {status === 'loading' || (status === 'authenticated' && mine.isLoading) ? (
              <Skeleton className="h-64 rounded-lg" />
            ) : status !== 'authenticated' ? (
              <div className="space-y-3 rounded-lg bg-subtle p-5 text-sm">
                <p>Sign in or create a free account first. Your application, your licence and later your hub portal all use the same account.</p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/login?next=/cities%23apply" className="inline-flex h-10 items-center rounded-sm bg-primary px-4 font-semibold text-primary-foreground">Sign in</Link>
                  <Link href="/register?next=/cities%23apply" className="inline-flex h-10 items-center rounded-sm border border-input px-4 font-semibold">Create an account</Link>
                </div>
              </div>
            ) : open ? (
              <div className="space-y-3 rounded-lg bg-subtle p-5 text-sm">
                <p>You already have an application for {mine.data!.city}, {mine.data!.state}.</p>
                <Link href="/cities/application" className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 font-semibold text-primary-foreground">See where it stands <ArrowRight className="h-4 w-4" aria-hidden /></Link>
              </div>
            ) : (
              <HubApplyForm />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
