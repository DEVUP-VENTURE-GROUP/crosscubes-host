'use client';

import Link from 'next/link';
import { ArrowRight, Building2, Car, KeyRound, MapPin, ShieldCheck, Users } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { CubeArt } from '@/components/brand/cube-art';
import { SiteLink } from '@/components/layout/site-link';
import { SectionEyebrow, BRAND } from '@/features/marketing/sections';
import { useLiveHubs } from '@/features/hubs/api';

const SIDES = [
  { icon: KeyRound, who: 'Guests', title: 'Book a car, not a counter.', body: 'Pick the exact car, verify your ID in the app, and have it brought to your terminal, hotel or door.', href: '/search', cta: 'Find a car' },
  { icon: Car, who: 'Car owners', title: 'Your car, run for you.', body: 'Asset Partners hand their car to the city team, who rent it, deliver it and look after it, and pay them every month.', href: '/asset-partners', cta: 'Become an Asset Partner' },
  { icon: Building2, who: 'City operators', title: 'Run CrossCubes in your city.', body: 'A yearly city licence gives a local operator the booking platform, payments, ID checks and HQ support, and a share of every trip.', href: '/cities', cta: 'Apply for a city' },
] as const;

const PROMISES = [
  { icon: ShieldCheck, title: 'Every guest is checked', body: 'ID and licence checks happen before a car is handed over, in every city.' },
  { icon: MapPin, title: 'Local teams, one standard', body: 'Each city is run by its own team, with the same checklist, the same app and the same support behind it.' },
  { icon: Users, title: 'Clear money for everyone', body: 'Partners and city operators get a monthly statement showing every trip and every deduction.' },
] as const;

export default function AboutPage() {
  const live = useLiveHubs();
  const cities = (live.data ?? []).map((h) => h.city);

  return (
    <div className="-mt-24 space-y-20 pb-20 sm:space-y-24">
      <section className="full-bleed relative isolate overflow-hidden hero-mesh">
        <div aria-hidden className="cube-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_75%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-16 pt-32 sm:px-6 sm:pb-24 sm:pt-36 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <Reveal className="min-w-0">
            <span className="text-sm font-semibold uppercase tracking-wider text-signal">
              About {BRAND}
            </span>
            <h1 className="display mt-6 text-[2.6rem] leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
              A car network,
              <br />
              <span className="text-signal">One city at a time.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
              {BRAND} is the city-by-city car rental network from CatoDrive, Inc. Each city is its own cube: a local team, local cars from local owners, all on one platform.
            </p>
            <p className="mt-4 text-sm text-white/60">{cities.length ? `Live in ${cities.join(', ')}.` : 'Opening city by city.'}</p>
          </Reveal>
          <div className="relative mx-auto hidden w-full max-w-sm lg:block">
            <CubeArt className="w-full" />
          </div>
        </div>
      </section>

      <section>
        <Reveal className="max-w-2xl">
          <SectionEyebrow>Three sides, one network</SectionEyebrow>
          <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">Who {BRAND} is for.</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {SIDES.map((s, i) => (
            <Reveal key={s.who} delay={i * 80}>
              <div className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary/50 sm:p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-md bg-ink text-signal"><s.icon className="h-6 w-6" aria-hidden /></span>
                <p className="mt-6 text-label font-semibold uppercase tracking-wider text-primary">{s.who}</p>
                <h3 className="display mt-2 text-2xl text-foreground">{s.title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                <Link href={s.href} className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">{s.cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative isolate overflow-hidden rounded-lg hero-mesh px-6 py-14 text-white sm:px-12 sm:py-20">
        <div aria-hidden className="cube-grid absolute inset-0 -z-10" />
        <Reveal className="max-w-2xl">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-signal">What stays the same everywhere</span>
          <h2 className="display mt-4 text-3xl sm:text-4xl lg:text-5xl">The same standard in every city.</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {PROMISES.map((p) => (
            <div key={p.title} className="rounded-lg border border-white/10 bg-white/[0.04] p-6">
              <p.icon className="h-6 w-6 text-signal" aria-hidden />
              <h3 className="mt-4 font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/65">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Reveal as="section" className="grid gap-6 rounded-lg border border-border bg-card p-6 sm:p-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <h2 className="display text-2xl text-foreground sm:text-3xl">Part of CatoDrive.</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">{BRAND} is operated by CatoDrive, Inc., headquartered in Dallas–Fort Worth, Texas. Partner agreements, payments and guest support all run through CatoDrive, Inc.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/contact" className="inline-flex h-11 items-center gap-2 rounded-md border border-border px-5 text-sm font-semibold hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Contact us</Link>
          <SiteLink site="partner" path="/sign-up" className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            List your car <ArrowRight className="h-4 w-4" aria-hidden />
          </SiteLink>
        </div>
      </Reveal>
    </div>
  );
}
