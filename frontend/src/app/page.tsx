'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, Zap, ArrowRight, CarFront, KeyRound, Route, BadgeCheck,
  Search, UserCheck, FileCheck2, Lock, CreditCard, Ban, ClipboardList,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CubeArt } from '@/components/brand/cube-art';
import { useLiveHubs } from '@/features/hubs/api';
import { Reveal } from '@/components/ui/reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { VehicleCard } from '@/features/vehicles/components/vehicle-card';
import { SearchBarFields } from '@/features/search/search-bar-fields';
import { useTrending, useFacets } from '@/features/vehicles/hooks';

// ─── Static data ──────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: CarFront,
    title: 'Find the one',
    body: 'Browse our premium managed fleet. Filter by price, vehicle type, or delivery - every car is operated by us.',
  },
  {
    icon: KeyRound,
    title: 'Book in seconds',
    body: 'Reserve instantly with Instant Book. No back-and-forth, no waiting on anyone to approve.',
  },
  {
    icon: Route,
    title: 'Hit the road',
    body: 'Pick it up or have our team deliver it - your door, hotel, or terminal. Keys in hand, on time.',
  },
];

const RESERVATION_FLOW = [
  { icon: Search,     label: 'Choose',    body: 'The exact vehicle - real photos, real plate. Not a class or a placeholder.' },
  { icon: UserCheck,  label: 'Verify',    body: 'Identity checked in the flow. No separate office visit required.' },
  { icon: FileCheck2, label: 'Documents', body: 'Licence on file before pickup, not at the curb when it is too late.' },
  { icon: Lock,       label: 'Hold',      body: 'Card authorised, not charged. The vehicle is locked to you.' },
  { icon: CreditCard, label: 'Capture',   body: 'Charged only once the reservation is confirmed and the trip is set.' },
] as const;

const RESERVATION_TRUST = [
  { icon: CarFront,      label: 'Exact vehicle, not a class' },
  { icon: Ban,           label: 'No double bookings' },
  { icon: UserCheck,     label: 'Verified in the flow' },
  { icon: Lock,          label: 'Held, then charged' },
  { icon: ClipboardList, label: 'Everything on the reservation' },
] as const;

const WHY_ITEMS = [
  {
    icon: MapPin,
    title: 'Delivered where you land',
    body: 'Every city sets its own delivery spots: the airport terminal, your hotel or your office. No shuttle, no satellite lot.',
  },
  {
    icon: ShieldCheck,
    title: 'Every car is managed by us',
    body: 'Not a marketplace. Every vehicle is owned by CrossCubes or our Asset Partners, and insured and maintained by CrossCubes.',
  },
  {
    icon: Zap,
    title: 'Instant Book, always',
    body: 'Confirm in seconds. No host approval, no waiting. The reservation is live the moment you pay.',
  },
  {
    icon: BadgeCheck,
    title: 'Up to $0 deductible',
    body: 'Choose a protection plan at checkout. Our Premier plan covers you completely - zero out-of-pocket.',
  },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const [picked, setCity] = useState('');
  const active = cities.find((c) => c.city === picked) ?? cities[0];
  const city = active?.city ?? '';
  const trending = useTrending(active?.lng, active?.lat);

  return (
    <div className="-mt-24">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      {/* A rounded photo card that starts just below the floating navbar, so nothing in the photo hides behind it;
          the search bar sits across the card's bottom edge. */}
      <section className="full-bleed relative isolate overflow-hidden hero-mesh">
        <div aria-hidden className="cube-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_75%)]" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pb-10 pt-28 sm:px-6 sm:pb-12 sm:pt-32 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-6">
          <div className="min-w-0">
            <Reveal>
              <LiveCitiesBadge />
              <h1 className="display mt-6 text-[2.75rem] leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Cars, <span className="text-signal">city</span>
                <br />
                by city.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                Every car is run by a local CrossCubes team: delivered to your terminal, hotel or door, checked before every trip, and backed by one company in every city.
              </p>
            </Reveal>
          </div>
          <div className="relative mx-auto hidden w-full max-w-md lg:block">
            <CubeArt className="w-full" />
          </div>
        </div>
        <Reveal delay={80} className="relative mx-auto -mt-4 max-w-7xl px-4 pb-14 sm:-mt-8 sm:px-6 sm:pb-20">
          <div className="search-halo">
            <SearchBarFields calendarPlacement="overlay" />
          </div>
        </Reveal>
      </section>

      {/* ── Body sections ────────────────────────────────────────────────── */}
      <div className="space-y-20 pb-12 pt-10 sm:space-y-24 sm:pb-16 sm:pt-12">

        {/* ── Available vehicles ─────────────────────────────────────────── */}
        <section className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Ready to book</p>
              <h2 className="display mt-1.5 text-2xl text-foreground sm:text-3xl">
                {city ? `Available in ${city}` : 'Our vehicles'}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              {cities.length > 1 && (
                <div className="hide-scrollbar flex gap-1.5 overflow-x-auto">
                  {cities.map((c) => (
                    <button
                      key={c.city}
                      onClick={() => setCity(c.city)}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        c.city === city
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      {c.city}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {trending.isLoading ? (
            <div className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-2 sm:gap-6 sm:pb-0 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-80 w-[85vw] shrink-0 snap-center rounded-lg sm:w-auto" />
              ))}
            </div>
          ) : trending.data && trending.data.length > 0 ? (
            <>
              {/* Phones: one car at a time, swiped sideways. Tablet and up: a grid. */}
              <div className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-2 sm:gap-6 sm:pb-0 lg:grid-cols-4">
                {trending.data.slice(0, 4).map((v) => (
                  <VehicleCard key={v._id} vehicle={v} className="w-[85vw] shrink-0 snap-center sm:w-auto" />
                ))}
              </div>
              <div>
                <Link
                  href={city ? `/search?city=${encodeURIComponent(city)}` : '/search'}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  View all vehicles <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-border py-16 text-center">
              <p className="text-muted-foreground">
                No vehicles available right now -{' '}
                <Link href="/contact" className="font-medium text-primary underline underline-offset-4">
                  contact us
                </Link>{' '}
                to arrange a booking.
              </p>
            </div>
          )}
        </section>

        <CitiesSection />

        {/* ── How it works ───────────────────────────────────────────────── */}
        <Reveal as="section" className="space-y-10 sm:space-y-14">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">How it works</p>
            <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl lg:text-5xl">
              From search to keys in three steps.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Choose the car, verify once, and it is brought to you.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3 md:gap-6 lg:gap-10">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 100} className="group flex flex-col">
                {/* Step number */}
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-black text-primary-foreground">
                    {i + 1}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="relative mb-5 flex aspect-[4/3] w-full items-end overflow-hidden rounded-lg hero-mesh p-6">
                  <div aria-hidden className="cube-grid absolute inset-0" />
                  <span className="display relative text-8xl leading-none text-white/10 transition-colors duration-500 group-hover:text-white/20">0{i + 1}</span>
                  <s.icon aria-hidden className="absolute end-6 top-6 h-10 w-10 text-signal transition-transform duration-500 group-hover:-translate-y-1" />
                </div>
                <h3 className="display text-xl text-foreground">{s.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── Why CrossCubes ────────────────────────────────────────────────── */}
        <Reveal as="section" className="space-y-10">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Why CrossCubes</p>
            <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl">
              A rental company that works<br className="hidden sm:block" /> the way you travel.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY_ITEMS.map((w, i) => (
              <Reveal key={w.title} delay={i * 80}>
                <div className="group flex h-full flex-col rounded-lg border border-border bg-card p-6 transition-all duration-300 hover:border-primary/40">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 transition-transform duration-500 group-hover:scale-110">
                    <w.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-semibold text-foreground">{w.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{w.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Reveal>

        {/* ── Reservation scroll section ───────────────────────────────── */}
        <ReservationFlowSection />

        {/* ── Trust strip ──────────────────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card p-8 sm:p-10">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-10">
            {[
              { icon: ShieldCheck, stat: 'Professionally Maintained', label: 'Every vehicle is owned, serviced, and detailed by our team before every trip.' },
              { icon: BadgeCheck,  stat: 'Up to $0 Deductible',       label: 'Choose a protection plan at checkout. Our Premier plan leaves nothing to pay.' },
              { icon: Zap,         stat: 'Instant Book',              label: 'Confirmed the moment you pay. No host approval required.' },
            ].map((t) => (
              <div key={t.stat} className="flex items-start gap-4">
                <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <t.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">{t.stat}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Asset Partner CTA ──────────────────────────────────────────── */}
        <Reveal as="section" className="relative isolate overflow-hidden rounded-lg hero-mesh">
          <div className="grid items-center gap-10 px-8 py-14 sm:px-14 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
            <div className="max-w-lg">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-white/80 backdrop-blur-sm">
                Asset Partner Programme
              </span>
              <h2 className="display mt-5 text-[2.2rem] leading-[1.05] text-white sm:text-[3rem]">
                Your car can pay
                <br />
                <span className="text-white/55">for itself.</span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-white/65 sm:text-lg">
                We list it, price it, deliver it and service it - with no calendar to manage, no guests to coordinate, no hassle.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/asset-partners">
                  <Button size="lg" variant="secondary" className="rounded-full px-7">
                    Become an Asset Partner <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/asset-partners">
                  <Button size="lg" variant="ghost" className="rounded-full px-7 text-white/80 hover:text-white hover:bg-white/10">
                    See the numbers
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative order-first lg:order-last">
              <div className="cube-grid relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] p-6">
                <CubeArt className="mx-auto w-full max-w-sm" />
              </div>
            </div>
          </div>
        </Reveal>

      </div>
    </div>
  );
}

// ─── Reservation scroll section ───────────────────────────────────────────────

function ReservationFlowSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const start = section.offsetTop;
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const rawP = Math.min(1, Math.max(0, (window.scrollY - start) / travel));
      const eased = rawP < 0.5 ? 2 * rawP * rawP : 1 - Math.pow(-2 * rawP + 2, 2) / 2;
      setProgress(eased);
      const maxOffset = Math.max(0, track.scrollWidth - track.parentElement!.clientWidth);
      setOffset(maxOffset * eased);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative isolate overflow-clip rounded-lg hero-mesh min-h-[calc(100vh+28rem)] px-6 py-8 sm:px-10 sm:py-10 lg:px-14"
    >
      <div className="sticky top-20 flex min-h-[calc(100vh-6rem)] flex-col justify-center sm:top-24 sm:min-h-[calc(100vh-8rem)]">

        {/* Copy */}
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-white/80 backdrop-blur">
            One reservation, end to end
          </span>
          <h2 className="display mt-5 text-[2.2rem] leading-[1.02] text-white sm:text-[3rem] lg:text-5xl">
            Pick the exact car.
            <br />Get it at the curb.
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-white/65 sm:text-lg">
            A real reservation on a real vehicle - held the moment you book it.
            Not a request form that somebody calls you back about.
          </p>
        </div>

        {/* Horizontal scroll track */}
        <div className="mt-8 overflow-hidden sm:mt-10">
          <div
            ref={trackRef}
            className="flex w-max gap-4 py-2 transition-transform duration-300 ease-out motion-reduce:translate-x-0 motion-reduce:transition-none"
            style={{ transform: `translate3d(-${offset}px, 0, 0)` }}
          >
            {RESERVATION_FLOW.map((step, i) => {
              const centerI = progress * (RESERVATION_FLOW.length - 1);
              const diff = Math.abs(centerI - i);
              const isActive = diff < 0.6;
              const scale = isActive ? 1 : Math.max(0.88, 1 - diff * 0.06);
              const opacity = isActive ? 1 : Math.max(0.22, 1 - diff * 0.48);

              return (
                <article
                  key={step.label}
                  className="w-[min(80vw,20rem)] shrink-0 overflow-hidden rounded-lg p-5 backdrop-blur-sm sm:w-[21rem] transition-all duration-300"
                  style={{
                    transform: `scale(${scale})`,
                    opacity,
                    border: isActive
                      ? '1.5px solid hsl(var(--primary) / 0.65)'
                      : '1px solid rgba(255,255,255,0.06)',
                    background: isActive
                      ? 'linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, rgba(0,0,0,0.4) 100%)'
                      : 'rgba(0,0,0,0.3)',
                    boxShadow: isActive
                      ? '0 0 0 1px hsl(var(--primary) / 0.15), 0 24px 48px rgba(0,0,0,0.5)'
                      : '0 8px 24px rgba(0,0,0,0.35)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300"
                      style={{
                        background: isActive ? 'hsl(var(--primary) / 0.25)' : 'rgba(255,255,255,0.06)',
                        color: isActive ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.35)',
                        borderColor: isActive ? 'hsl(var(--primary) / 0.4)' : 'rgba(255,255,255,0.08)',
                      }}
                    >
                      <step.icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p
                        className="text-xs font-black uppercase tracking-[0.2em] transition-colors duration-300"
                        style={{ color: isActive ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.28)' }}
                      >
                        {step.label}
                      </p>
                    </div>
                  </div>
                  <p
                    className="mt-3.5 text-sm leading-relaxed transition-colors duration-300"
                    style={{ color: isActive ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.28)' }}
                  >
                    {step.body}
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        {/* Money note */}
        <div className="mt-5 flex items-center gap-2 text-sm text-white/45">
          <Lock className="h-3.5 w-3.5 shrink-0 text-primary/60" />
          <span>The money never moved until it had to.</span>
        </div>

        {/* Trust points + CTA */}
        <div className="mt-6 flex flex-col gap-5 border-t border-white/10 pt-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            {RESERVATION_TRUST.map((trust) => (
              <span key={trust.label} className="flex items-center gap-2 text-xs font-medium text-white/65 sm:text-sm">
                <trust.icon className="h-3.5 w-3.5 shrink-0 text-primary" /> {trust.label}
              </span>
            ))}
          </div>
          <Link
            href="/search"
            className="group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-sm font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-95"
          >
            Book Now <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

      </div>
    </section>
  );
}

// ─── Live cities ──────────────────────────────────────────────────────────────

function LiveCitiesBadge() {
  const live = useLiveHubs();
  const names = (live.data ?? []).map((h) => h.city);
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-white/80 backdrop-blur-sm">
      <span aria-hidden className="relative flex h-2 w-2 shrink-0">
        <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
      </span>
      <span className="truncate">{names.length ? `Live in ${names.join(' · ')}` : 'Opening city by city'}</span>
    </span>
  );
}

function CitiesSection() {
  const live = useLiveHubs();
  const hubs = live.data ?? [];
  return (
    <Reveal as="section" className="space-y-8">
      <div className="max-w-xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Cities</p>
        <h2 className="display mt-2 text-3xl text-foreground sm:text-4xl">One company. Run local in every city.</h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">Each city has its own CrossCubes team that looks after the cars, the cleaning and the hand-over.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {live.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-lg" />)
          : hubs.map((h) => (
              <Link
                key={h.id}
                href={`/search?city=${encodeURIComponent(h.city)}`}
                className="group relative isolate flex h-44 flex-col justify-between overflow-hidden rounded-lg hero-mesh p-6 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div aria-hidden className="cube-grid absolute inset-0 -z-10" />
                <span className="inline-flex w-fit items-center rounded-full bg-signal px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-signal-foreground">Live · {h.code}</span>
                <div>
                  <p className="display text-3xl leading-none">{h.city}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-white/70">
                    {h.state} · Browse cars <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </p>
                </div>
              </Link>
            ))}
        <Link
          href="/cities"
          className="group flex h-44 flex-col justify-between rounded-lg border-2 border-dashed border-border p-6 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MapPin className="h-6 w-6 text-primary" aria-hidden />
          <div>
            <p className="display text-2xl text-foreground">Your city next?</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground group-hover:text-primary">
              Run CrossCubes where you live <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </p>
          </div>
        </Link>
      </div>
    </Reveal>
  );
}
