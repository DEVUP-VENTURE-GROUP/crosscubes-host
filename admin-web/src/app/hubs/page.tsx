'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Building2, Car, Network, Plus, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { BarChart, Sparkline } from '@/components/ui/charts';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';
import { growthPct, HUB_STATUS_LABEL, HUB_STATUS_TONE, type HubPerformance } from '@/features/hubs/types';
import { formatMoney } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';

type Period = 'month' | '30d' | 'quarter' | 'year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
];

function rangeFor(p: Period, now = new Date()): { from: string; to: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from =
    p === 'month' ? new Date(Date.UTC(y, m, 1))
    : p === '30d' ? new Date(now.getTime() - 30 * 86_400_000)
    : p === 'quarter' ? new Date(Date.UTC(y, m - (m % 3), 1))
    : new Date(Date.UTC(y, 0, 1));
  return { from: from.toISOString(), to: now.toISOString() };
}

const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

function Growth({ now, before }: { now: number; before: number }) {
  const g = growthPct(now, before);
  if (g === null) return <span className="text-xs text-muted-foreground">New</span>;
  const up = g >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${up ? 'text-success' : 'text-destructive'}`}>
      {up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
      {Math.abs(g)}%<span className="sr-only">{up ? ' up' : ' down'} on the previous period</span>
    </span>
  );
}

export default function HubNetworkPage() {
  const [period, setPeriod] = useState<Period>('month');
  // Fixed once per period choice so the query key doesn't change on every render.
  const range = useMemo(() => rangeFor(period), [period]);
  const q = useQuery({ queryKey: ['hub-overview', period], queryFn: () => adminApi.hubOverview(range), placeholderData: keepPreviousData, refetchInterval: 60_000 });
  const data = q.data;

  const trend = useMemo(
    () => (data?.monthly ?? []).map((m) => ({ label: MONTH.format(new Date(`${m.month}-01T00:00:00Z`)), value: Object.values(m.byHub).reduce((s, v) => s + v, 0) })),
    [data],
  );
  const sparkFor = (id: string) => (data?.monthly ?? []).map((m) => m.byHub[id] ?? 0);
  const ranked = useMemo(() => (data?.hubs ?? []).map((h) => ({ ...h, _id: h.id })).sort((a, b) => b.gmv - a.gmv), [data]);
  const attention = ranked.filter((h) => h.licencesExpiringSoon > 0 || h.status === 'paused');

  const columns: Column<HubPerformance & { _id: string }>[] = [
    {
      header: 'Hub',
      cell: (h) => (
        <Link href={adminPath(`hubs/${h.id}`)} className="flex min-w-0 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid h-10 w-12 shrink-0 place-items-center rounded-sm bg-ink font-display text-sm font-bold tracking-wide text-background">{h.code}</span>
          <span className="min-w-0">
            <span className="block truncate font-semibold hover:underline">{h.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{h.city}, {h.state}</span>
          </span>
        </Link>
      ),
    },
    {
      header: 'Status',
      cell: (h) => (
        <div className="flex flex-col items-start gap-0.5">
          <Badge tone={HUB_STATUS_TONE[h.status]}>{HUB_STATUS_LABEL[h.status]}</Badge>
          {h.status === 'setup' && h.blockers > 0 && <span className="text-xs text-muted-foreground tabular-nums">{h.blockers} step{h.blockers === 1 ? '' : 's'} to launch</span>}
          {h.licencesExpiringSoon > 0 && <span className="text-xs font-medium text-warning">Licence expiring</span>}
        </div>
      ),
    },
    {
      header: 'Gross',
      numeric: true,
      sortValue: (h) => h.gmv,
      cell: (h) => (
        <div className="flex flex-col items-end">
          <span className="font-semibold tabular-nums">{usd(h.gmv)}</span>
          <Growth now={h.gmv} before={h.previousGmv} />
        </div>
      ),
    },
    { header: 'Owed to HQ', numeric: true, sortValue: (h) => h.owedToHq, cell: (h) => <span className="tabular-nums">{usd(h.owedToHq)}<span className="block text-xs text-muted-foreground">{h.feePct}% of gross</span></span> },
    { header: 'Trips', numeric: true, sortValue: (h) => h.trips, cell: (h) => <span className="tabular-nums">{h.trips.toLocaleString()}</span>, hideOnMobile: true },
    { header: 'Cars live', numeric: true, sortValue: (h) => h.listedCars, cell: (h) => <span className="tabular-nums">{h.listedCars}<span className="text-muted-foreground"> / {h.cars}</span></span>, hideOnMobile: true },
    { header: '6 months', cell: (h) => <div className="w-24"><Sparkline data={sparkFor(h.id)} /></div>, hideOnMobile: true },
  ];

  if (q.isError && !data) return <ErrorState message="We couldn’t load the hub network." retry={() => void q.refetch()} />;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Franchise"
        title="Hub network"
        description={data ? `${data.totals.live} of ${data.totals.hubs} hub${data.totals.hubs === 1 ? '' : 's'} live. Gross is every paid, active and completed trip, the same as Reports.` : 'Every hub side by side.'}
        actions={
          <Link href={adminPath('hubs/new')}>
            <Button><Plus className="h-4 w-4" aria-hidden /> New hub</Button>
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <Chip key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>{p.label}</Chip>
        ))}
      </div>

      {!data ? (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-lg" />)}</div>
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-80 w-full rounded-lg" />
        </div>
      ) : data.totals.hubs === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Network className="h-6 w-6" />}
              title="No hubs yet"
              description="A hub is one city run by one franchisee. Create the first one with its area, money terms and franchisee, then work through the launch checklist."
              action={<Link href={adminPath('hubs/new')}><Button><Plus className="h-4 w-4" aria-hidden /> Create the first hub</Button></Link>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Network totals">
            <StatTile tone="primary" icon={<Building2 className="h-5 w-5" />} label="Network gross" value={usd(data.totals.gmv)} sub={growthLabel(data.totals.gmv, data.totals.previousGmv)} />
            <StatTile tone="primary" icon={<Wallet className="h-5 w-5" />} label="Owed to HQ" value={usd(data.totals.owedToHq)} sub="Royalty, tech fee and marketing fund" />
            <StatTile icon={<Network className="h-5 w-5" />} label="Live hubs" value={`${data.totals.live} / ${data.totals.hubs}`} sub={data.totals.hubs - data.totals.live > 0 ? `${data.totals.hubs - data.totals.live} getting ready or paused` : 'All hubs taking bookings'} />
            <StatTile icon={<Car className="h-5 w-5" />} label="Cars live" value={data.totals.listedCars.toLocaleString()} sub={`${data.totals.trips.toLocaleString()} trips this period`} />
          </section>

          {(attention.length > 0 || data.unassigned.trips > 0) && (
            <section className="space-y-2" aria-label="Needs attention">
              {attention.map((h) => (
                <Link key={h.id} href={adminPath(`hubs/${h.id}`)} className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                  <span>
                    <span className="font-semibold">{h.name}</span>{' '}
                    {h.status === 'paused' ? 'is paused and not taking bookings.' : `has ${h.licencesExpiringSoon} licence${h.licencesExpiringSoon === 1 ? '' : 's'} expiring within 30 days.`}
                  </span>
                </Link>
              ))}
              {data.unassigned.trips > 0 && (
                <p className="flex items-start gap-3 rounded-lg border border-border bg-subtle p-4 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="font-semibold tabular-nums">{data.unassigned.trips} trip{data.unassigned.trips === 1 ? '' : 's'} ({usd(data.unassigned.gmv)})</span> came from cars outside every hub’s area, so no hub is credited for them.
                  </span>
                </p>
              )}
            </section>
          )}

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Network gross per month, last 6 months</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart data={trend} height={200} currency="USD" />
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hubs, ranked by gross</h2>
            <DataTable
              columns={columns}
              rows={ranked}
              isLoading={q.isLoading}
              isError={q.isError}
              onRetry={() => void q.refetch()}
              errorMessage="We couldn’t load the hubs."
              emptyTitle="No hubs yet"
              caption="Hubs ranked by gross for the chosen period"
            />
          </section>
        </>
      )}
    </div>
  );
}

function growthLabel(now: number, before: number): string {
  const g = growthPct(now, before);
  if (g === null) return 'Nothing to compare with yet';
  return `${g >= 0 ? 'Up' : 'Down'} ${Math.abs(g)}% on the period before`;
}
