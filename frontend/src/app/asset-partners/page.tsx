'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, Calculator, Camera, Car, CheckCircle2, ChevronDown, ClipboardCheck, FileCheck, MapPin,
  Settings2, ShieldCheck, Wallet,
} from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { CubeArt } from '@/components/brand/cube-art';
import { SiteLink } from '@/components/layout/site-link';
import { SectionEyebrow, BRAND } from '@/features/marketing/sections';
import { usePlatformConfig } from '@/features/platform/config';
import { useLiveHubs } from '@/features/hubs/api';
import { formatMoney } from '@/lib/utils/format';

const STEPS = [
  { icon: Car, title: 'Apply with your car', body: 'Pick your city, add the car and three photos. About ten minutes, and nothing to pay to apply.' },
  { icon: ClipboardCheck, title: 'Your city team reviews it', body: 'The local CrossCubes team checks the car and your papers, and tells you exactly what to fix if anything.' },
  { icon: Camera, title: 'We list it', body: 'We photograph it, write the listing and price it for your city, every day.' },
  { icon: Settings2, title: 'We run every trip', body: 'Guest checks, delivery, cleaning and the hand-over back. You are never on call.' },
  { icon: Wallet, title: 'You get paid monthly', body: 'A statement every month showing every trip and every deduction, then your payout by Zelle or check.' },
] as const;

const REQUIREMENTS = [
  { icon: FileCheck, label: 'Title', value: 'A clean title in your name. Salvage, rebuilt, flood and lemon titles can’t be accepted.' },
  { icon: ShieldCheck, label: 'Condition', value: 'No major body, structural or safety problems. We inspect every car before it goes live.' },
  { icon: CheckCircle2, label: 'Standards', value: 'Smoke-free and pet-free, with tyres and brakes in good order.' },
  { icon: MapPin, label: 'City', value: 'The car is kept in a city where CrossCubes is live.' },
] as const;

const usd = (cents?: number) => (cents == null ? '—' : formatMoney({ amount: cents, currency: 'USD' }));
const pct = (bps?: number) => (bps == null ? '—' : `${Number((bps / 100).toFixed(1))}%`);
const ordinal = (n?: number) => {
  if (n == null) return '—';
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
};

export default function AssetPartnersPage() {
  const config = usePlatformConfig();
  const live = useLiveHubs();
  const t = config.data?.assetPartner;
  const cities = (live.data ?? []).map((h) => h.city);

  const terms = [
    { label: 'Management fee', value: pct(t?.managementFeeBps), sub: 'Of each booking, for running everything' },
    { label: 'Fleet insurance', value: usd(t?.insuranceMonthlyCents), sub: 'Per car, per month' },
    { label: 'Professional detailing', value: usd(t?.detailingMonthlyCents), sub: 'Per car, per month' },
    { label: 'Your damage cap', value: usd(t?.deductibleCapCents), sub: 'Most you pay per incident' },
    { label: 'Repairs need your OK above', value: usd(t?.maintenanceApprovalCents), sub: 'Anything smaller is handled for you' },
    { label: 'Payout day', value: ordinal(t?.payoutDayOfMonth), sub: 'Of each month, for last month’s trips' },
  ];

  const faq = [
    { q: 'Do I have to do anything once the car is live?', a: 'No. Your city team lists it, prices it, checks every guest, delivers and collects it, and arranges cleaning and repairs. You only approve repairs above the limit shown on this page.' },
    { q: 'How much will I earn?', a: `You keep each booking less the ${pct(t?.managementFeeBps)} management fee, minus insurance and detailing each month. Earnings depend on your car and your city, so use the earnings calculator for an estimate rather than a promise.` },
    { q: 'What if a guest damages the car?', a: `Your share is capped at ${usd(t?.deductibleCapCents)} per incident, and the cap is written into your agreement before you sign. CrossCubes covers what isn’t recovered above it.` },
    { q: 'Can I still use my car?', a: 'Yes. Block the dates you need it and it won’t be booked for them. You can also ask for the car back on the notice set out in your agreement.' },
    { q: 'Who do I sign with?', a: `${BRAND} is part of CatoDrive, Inc. Your agreement is with CatoDrive, Inc. trading as ${BRAND}, and your city team runs the car day to day.` },
    { q: 'When do I get paid?', a: `On the ${ordinal(t?.payoutDayOfMonth)} of each month, for trips completed the month before, by Zelle or check. Every payout comes with a statement listing each trip and deduction.` },
  ];

  return (
    <div className="-mt-24 space-y-20 pb-20 sm:space-y-24">
      <section className="full-bleed relative isolate overflow-hidden hero-mesh">
        <div aria-hidden className="cube-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_75%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-32 sm:px-6 sm:pb-24 sm:pt-36 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Reveal className="min-w-0">
            <span className="text-sm font-semibold uppercase tracking-wider text-signal">
              Asset Partner programme
            </span>
            <h1 className="display mt-6 text-[2.6rem] leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Your car.
              <br />
              <span className="text-signal">Our city team.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              Put the car you already own to work. The {BRAND} team in your city lists it, rents it, delivers it and looks after it, and pays you every month.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <SiteLink site="partner" path="/sign-up" className="group inline-flex h-12 items-center gap-2 rounded-md bg-signal px-6 text-sm font-bold text-signal-foreground transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
                Apply with your car <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </SiteLink>
              <Link href="/calculator" className="inline-flex h-12 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-6 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                <Calculator className="h-4 w-4" aria-hidden /> Estimate your earnings
              </Link>
            </div>
            <p className="mt-6 text-sm text-white/60">
              {cities.length ? `Open now in ${cities.join(', ')}.` : 'Opening city by city.'}{' '}
              <SiteLink site="partner" path="/sign-in" className="font-semibold text-white underline-offset-4 hover:underline">Already a partner? Sign in</SiteLink>
            </p>
          </Reveal>
          <div className="relative mx-auto hidden w-full max-w-sm lg:block">
            <CubeArt className="w-full" />
          </div>
        </div>
      </section>

      <section id="terms" className="scroll-mt-24">
        <Reveal className="max-w-2xl">
          <SectionEyebrow>The terms</SectionEyebrow>
          <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">Partner terms</h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">These are the standard terms printed in every partner agreement. Nothing is bundled or hidden.</p>
        </Reveal>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {terms.map((x, i) => (
            <Reveal key={x.label} delay={i * 60}>
              <div className="h-full rounded-lg border border-border bg-card p-5 sm:p-6">
                <p className="text-label font-semibold text-muted-foreground">{x.label}</p>
                {config.isLoading ? (
                  <Skeleton className="mt-3 h-9 w-24" />
                ) : (
                  <p className="display mt-2 text-3xl tabular-nums text-foreground sm:text-4xl">{x.value}</p>
                )}
                <p className="mt-2 text-sm text-muted-foreground">{x.sub}</p>
              </div>
            </Reveal>
          ))}
        </div>
        {config.isError && <p role="alert" className="mt-4 text-sm text-destructive">We couldn’t load the current terms. They are also in the agreement you review before signing.</p>}
      </section>

      <section className="relative isolate overflow-hidden rounded-lg hero-mesh px-6 py-14 text-white sm:px-12 sm:py-20">
        <div aria-hidden className="cube-grid absolute inset-0 -z-10" />
        <Reveal className="max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-signal">From application to payout</span>
          <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">How it works</h2>
        </Reveal>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <span className="display text-5xl leading-none text-white/15">0{i + 1}</span>
              <s.icon className="mt-4 h-6 w-6 text-signal" aria-hidden />
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <Reveal>
          <SectionEyebrow>Which cars</SectionEyebrow>
          <h2 className="display mt-4 text-3xl sm:text-4xl">What we look for.</h2>
          <p className="mt-4 text-base text-muted-foreground">The application checks the title straight away; the city team checks the rest in person.</p>
        </Reveal>
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {REQUIREMENTS.map((r) => (
            <li key={r.label} className="flex gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><r.icon className="h-5 w-5" aria-hidden /></span>
              <div>
                <p className="font-semibold text-foreground">{r.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.value}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl">
        <Reveal className="text-center">
          <SectionEyebrow>Questions</SectionEyebrow>
          <h2 className="display mt-4 text-3xl sm:text-4xl">Common questions</h2>
        </Reveal>
        <div className="mt-10 space-y-3">
          {faq.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Something else? <Link href="/contact?interest=asset_partner" className="font-semibold text-primary hover:underline">Ask the team</Link>
        </p>
      </section>

      <Reveal as="section" className="relative isolate overflow-hidden rounded-lg hero-mesh px-6 py-16 text-center text-white sm:px-12 sm:py-24">
        <div aria-hidden className="cube-grid absolute inset-0 -z-10" />
        <h2 className="display mx-auto max-w-2xl text-3xl sm:text-4xl lg:text-5xl">Apply with your car</h2>
        <p className="mx-auto mt-4 max-w-xl text-white/70">Ten minutes to apply. Your city team gets back to you, and you can follow every step in your partner portal.</p>
        <SiteLink site="partner" path="/sign-up" className="group mt-8 inline-flex h-12 items-center gap-2 rounded-md bg-signal px-7 text-sm font-bold text-signal-foreground transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
          Apply with your car <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </SiteLink>
      </Reveal>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-4 p-5 text-start font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {q}
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>}
    </div>
  );
}
