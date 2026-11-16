'use client';

import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { ErrorState } from '@/components/ui/states';
import { useMyHub, useMyHubInsurance, useMyHubPayouts, useMyHubWheelbaseBookings, holderTotals } from '~/features/hub/api';
import { INSURANCE_HELP, INSURANCE_LABEL, INSURANCE_TONE, RESERVATION_LABEL, RESERVATION_TONE, reservationAmount, reservationDates } from '@/features/insurance/labels';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { bpsToPercent, DOCUMENT_LABEL, HUB_STATUS_LABEL, HUB_STATUS_TONE, PAYOUT_METHOD_LABEL, type DocumentKind, type HubStatus } from '@/features/hubs/types';


const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const SOON = 30 * 86_400_000;

function dateTone(iso?: string): 'success' | 'warning' | 'destructive' | 'muted' {
  if (!iso) return 'muted';
  const left = new Date(iso).getTime() - Date.now();
  return left <= 0 ? 'destructive' : left <= SOON ? 'warning' : 'success';
}

export default function MyHubPage() {
  const hub = useMyHub();
  const payouts = useMyHubPayouts();
  const insurance = useMyHubInsurance();
  const wbBookings = useMyHubWheelbaseBookings();

  if (hub.isError) return <ErrorState message="We couldn’t load your hub." retry={() => void hub.refetch()} />;
  if (!hub.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-12 w-64" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div></div>;

  const h = hub.data;
  const { paid: paidTotal, owed } = holderTotals(payouts.data);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={h.code} title={`${h.name}, ${h.state}`} description={h.launchedAt ? `Live since ${formatDate(h.launchedAt)}.` : 'Not live yet.'} />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Your hub">
        <StatTile label="Status" value={HUB_STATUS_LABEL[h.status]} />
        <StatTile label="Your share of each trip" value={bpsToPercent(h.holderShareBps)} sub="Of the rental price, before tax" />
        <StatTile tone={owed > 0 ? 'primary' : 'default'} label="Waiting to be paid" value={usd(owed)} />
        <StatTile label="Paid to you so far" value={usd(paidTotal)} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle>City licence</CardTitle>
            <Badge tone={HUB_STATUS_TONE[h.status]}>{HUB_STATUS_LABEL[h.status]}</Badge>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {h.licenceExpiresAt ? (
              <p className="flex flex-wrap items-center gap-2">Runs to <Badge tone={dateTone(h.licenceExpiresAt)}>{formatDate(h.licenceExpiresAt)}</Badge></p>
            ) : (
              <p>Not paid yet.</p>
            )}
            <p className="text-muted-foreground">We remind you before it ends. If it runs out, your city stops taking bookings until it’s renewed.</p>
            {h.launchBlockers.length > 0 && (
              <div className="rounded-lg bg-subtle p-3">
                <p className="font-semibold">Before your city goes live</p>
                <ul className="mt-1 list-disc space-y-1 ps-5 text-muted-foreground">{h.launchBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Insurance and documents</CardTitle></CardHeader>
          <CardContent>
            {h.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing on file. Send HQ your fleet insurance and business licence.</p>
            ) : (
              <ul className="divide-y divide-border">
                {h.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{d.label}</span><span className="block text-xs text-muted-foreground">{DOCUMENT_LABEL[d.kind]}</span></span>
                    <Badge tone={dateTone(d.expiresAt)}>{d.expiresAt ? formatDate(d.expiresAt) : 'No expiry'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle>Car insurance</CardTitle>
          {insurance.data && insurance.data.cars.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">{insurance.data.cars.filter((c) => c.bookable).length} of {insurance.data.cars.length} cars can be booked</span>
          )}
        </CardHeader>
        <CardContent>
          {insurance.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : insurance.isError ? (
            <ErrorState message="We couldn’t load your cars’ insurance." retry={() => void insurance.refetch()} />
          ) : !insurance.data?.cars.length ? (
            <p className="text-sm text-muted-foreground">No cars in your city yet. Each car’s insurance shows here once it’s added.</p>
          ) : (
            <>
              <p className="pb-3 text-sm text-muted-foreground">
                Cars are insured through Wheelbase. HQ links each car to its Wheelbase listing{insurance.data.requireApproved ? ', and guests only see the cars marked Insured' : ''}.
                {insurance.data.checkedAt ? ` Last checked ${formatDate(insurance.data.checkedAt)}.` : ''} Ask HQ about any car that isn’t insured.
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {insurance.data.cars.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 p-3 text-sm">
                    {c.photoUrl ? <img src={c.photoUrl} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" /> : <span className="h-10 w-14 shrink-0 rounded-md bg-muted" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}{c.plate ? <span className="text-muted-foreground"> · {c.plate}</span> : null}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.insurance === 'approved' ? [c.planLabel, c.minRenterAge && `Drivers ${c.minRenterAge}+`].filter(Boolean).join(' · ') || INSURANCE_HELP.approved : INSURANCE_HELP[c.insurance]}
                      </span>
                    </span>
                    <Badge tone={INSURANCE_TONE[c.insurance]}>{INSURANCE_LABEL[c.insurance]}</Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Wheelbase bookings</CardTitle></CardHeader>
        <CardContent>
          {wbBookings.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : wbBookings.isError ? (
            <ErrorState message="We couldn’t load your Wheelbase bookings." retry={() => void wbBookings.refetch()} />
          ) : !wbBookings.data?.length ? (
            <p className="text-sm text-muted-foreground">No Wheelbase bookings yet. Trips guests book on your cars appear here on their own.</p>
          ) : (
            <>
              <p className="pb-3 text-sm text-muted-foreground">Guests book and pay through Wheelbase. Each trip blocks the car’s dates here and counts in your monthly statement once it ends.</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {wbBookings.data.map((b) => {
                  const car = insurance.data?.cars.find((c) => c.id === b.vehicleId);
                  return (
                    <li key={b._id} className="flex items-center gap-3 p-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{car?.name ?? 'Car'}{b.renterName ? <span className="text-muted-foreground"> · {b.renterName}</span> : null}</span>
                        <span className="block truncate text-xs text-muted-foreground tabular-nums">{reservationDates(b.period.start, b.period.end)} · {reservationAmount(b.amountCents, b.currency)}</span>
                      </span>
                      <Badge tone={RESERVATION_TONE[b.state]}>{RESERVATION_LABEL[b.state]}</Badge>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Delivery spots</CardTitle></CardHeader>
        <CardContent>
          {h.deliverySpots.length === 0 ? (
            <p className="text-sm text-muted-foreground">HQ hasn’t set standard delivery spots for your city yet. New cars start with no delivery places until it does.</p>
          ) : (
            <>
              <p className="pb-3 text-sm text-muted-foreground">Set by HQ. Every new car listed in your city starts with these places and fees; you can change them per car.</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {h.deliverySpots.map((d, i) => (
                  <li key={`${d.name}-${i}`} className="flex items-center gap-3 p-3 text-sm">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{d.address}{d.minTripDays ? ` · ${d.minTripDays}+ day trips` : ''}</span>
                    </span>
                    <span className="font-medium tabular-nums">{usd(d.fee)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Your monthly statements</CardTitle></CardHeader>
        <CardContent>
          {payouts.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : payouts.isError ? (
            <ErrorState message="We couldn’t load your statements." retry={() => void payouts.refetch()} />
          ) : !payouts.data?.length ? (
            <p className="text-sm text-muted-foreground">Your first statement arrives early next month, for the trips completed this month.</p>
          ) : (
            <ul className="divide-y divide-border">
              {payouts.data.map((p) => (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    <span className="block font-semibold">{MONTH.format(new Date(`${p.period}-01T00:00:00Z`))}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">{p.trips} trips{p.wheelbaseTrips ? ` (${p.wheelbaseTrips} via Wheelbase)` : ''} · {usd(p.grossCents)} in rentals · {bpsToPercent(p.holderShareBps)}</span>
                  </span>
                  <span className="text-end">
                    <span className="block font-semibold tabular-nums">{usd(p.amountCents)}</span>
                    {p.status === 'paid' && p.paid ? (
                      <span className="text-xs text-muted-foreground">{PAYOUT_METHOD_LABEL[p.paid.method]}, {formatDate(p.paid.at)}</span>
                    ) : p.status === 'paid' ? (
                      <span className="text-xs text-muted-foreground">Nothing to pay</span>
                    ) : (
                      <Badge tone="warning">On its way</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
