'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { ErrorState } from '@/components/ui/states';
import { api } from '@/lib/api/client';
import { formatDate, formatMoney } from '@/lib/utils/format';
import { bpsToPercent, DOCUMENT_LABEL, HUB_STATUS_LABEL, HUB_STATUS_TONE, PAYOUT_METHOD_LABEL, type DocumentKind, type HubPayout, type HubStatus } from '@/features/hubs/types';

interface MyHub {
  code: string;
  name: string;
  city: string;
  state: string;
  status: HubStatus;
  launchedAt?: string;
  holderShareBps: number;
  licenceExpiresAt?: string;
  documents: { id: string; kind: DocumentKind; label: string; expiresAt?: string }[];
  launchBlockers: string[];
}

const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const SOON = 30 * 86_400_000;

function dateTone(iso?: string): 'success' | 'warning' | 'destructive' | 'muted' {
  if (!iso) return 'muted';
  const left = new Date(iso).getTime() - Date.now();
  return left <= 0 ? 'destructive' : left <= SOON ? 'warning' : 'success';
}

export default function MyHubPage() {
  const hub = useQuery({ queryKey: ['my-hub'], queryFn: () => api.get<MyHub>('/ioc/hub') });
  const payouts = useQuery({ queryKey: ['my-hub-payouts'], queryFn: () => api.get<HubPayout[]>('/ioc/hub/payouts') });

  if (hub.isError) return <ErrorState message="We couldn’t load your hub." retry={() => void hub.refetch()} />;
  if (!hub.data) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-12 w-64" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}</div></div>;

  const h = hub.data;
  const paidTotal = (payouts.data ?? []).filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0);
  const owed = (payouts.data ?? []).filter((p) => p.status === 'pending').reduce((s, p) => s + p.amountCents, 0);

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
                    <span className="block text-xs text-muted-foreground tabular-nums">{p.trips} trips · {usd(p.grossCents)} in rentals · {bpsToPercent(p.holderShareBps)}</span>
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
