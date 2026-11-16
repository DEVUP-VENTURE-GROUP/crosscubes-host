'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/select';
import { StatTile } from '@/components/ui/stat-tile';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi, type WheelbaseCarRow, type WheelbaseListingRow, type WheelbaseOverview, type WheelbaseReservationRow } from '@/features/admin/api';
import { INSURANCE_HELP, INSURANCE_LABEL, INSURANCE_TONE, RESERVATION_LABEL, RESERVATION_TONE, reservationAmount, reservationDates, type InsuranceStatus } from '@/features/insurance/labels';
import { ApiError } from '@/lib/api/types';
import { formatDateTime } from '@/lib/utils/format';

type Filter = 'attention' | InsuranceStatus | '';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'approved', label: 'Insured' },
  { key: 'not_linked', label: 'Not linked' },
  { key: 'not_approved', label: 'Not approved' },
  { key: 'missing', label: 'Missing' },
  { key: '', label: 'All' },
];

const fail = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

interface SettingsDraft {
  dealerId: string;
  requireApproved: boolean;
  enforceMinAge: boolean;
  autoLink: boolean;
  importListings: boolean;
  syncMinutes: string;
  calendarDays: string;
  missingGraceHours: string;
  staleAlertHours: string;
}

const draftFrom = (o: WheelbaseOverview): SettingsDraft => ({
  dealerId: o.dealerId,
  requireApproved: o.settings.requireApproved,
  enforceMinAge: o.settings.enforceMinAge,
  autoLink: o.settings.autoLink,
  importListings: o.settings.importListings,
  syncMinutes: String(o.settings.syncMinutes),
  calendarDays: String(o.settings.calendarDays),
  missingGraceHours: String(o.settings.missingGraceHours),
  staleAlertHours: String(o.settings.staleAlertHours),
});

export default function CarInsurancePage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['wheelbase-overview'], queryFn: () => adminApi.wheelbaseOverview() });
  const [filter, setFilter] = useState<Filter>('attention');
  const [hubId, setHubId] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: ['wheelbase-overview'] });

  const sync = useMutation({
    mutationFn: () => adminApi.wheelbaseSync(),
    onSuccess: (r) => {
      refresh();
      if ('error' in r) toast({ tone: 'error', title: 'Wheelbase didn’t answer', description: 'Each car keeps its last known insurance. Try again in a few minutes.' });
      else if ('skipped' in r) toast({ tone: 'error', title: 'Add the Wheelbase account number first' });
      else toast({ tone: 'success', title: 'Read from Wheelbase', description: `${r.listings} listings, ${r.updated} cars refreshed.` });
    },
    onError: (e) => toast({ tone: 'error', title: fail(e, 'We couldn’t read Wheelbase just now.') }),
  });

  const link = useMutation({
    mutationFn: ({ car, rentalId }: { car: WheelbaseCarRow; rentalId: number | null }) => adminApi.wheelbaseLink(car._id, rentalId),
    onSuccess: (_r, { car, rentalId }) => {
      refresh();
      toast({ tone: 'success', title: rentalId === null ? `${car.name} unlinked` : `${car.name} linked` });
    },
    onError: (e) => toast({ tone: 'error', title: fail(e, 'We couldn’t change that link.') }),
  });

  const unlink = async (car: WheelbaseCarRow) => {
    const { ok } = await confirm({
      title: `Unlink ${car.name}?`,
      description: 'While approved cars only is on, guests can’t see or book it until it is linked again.',
      confirmLabel: 'Unlink',
      tone: 'destructive',
    });
    if (ok) link.mutate({ car, rentalId: null });
  };

  const data = q.data;
  const cities = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.cars ?? []) if (c.hub) m.set(c.hub.id, `${c.hub.name} (${c.hub.code})`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const inCity = useMemo(() => (data?.cars ?? []).filter((c) => !hubId || c.hub?.id === hubId), [data, hubId]);
  const counts = useMemo(() => {
    const n = { approved: 0, not_approved: 0, not_linked: 0, missing: 0, bookable: 0 };
    for (const c of inCity) {
      n[c.insurance] += 1;
      if (c.bookable) n.bookable += 1;
    }
    return n;
  }, [inCity]);
  const rows = useMemo(
    () => inCity.filter((c) => (filter === 'attention' ? c.insurance !== 'approved' : !filter || c.insurance === filter)),
    [inCity, filter],
  );
  const listingsById = useMemo(() => new Map((data?.listings ?? []).map((l) => [l.id, l])), [data]);

  const columns: Column<WheelbaseCarRow>[] = [
    {
      header: 'Car',
      sortValue: (c) => c.name,
      cell: (c) => (
        <span className="flex min-w-0 items-center gap-3">
          {c.photoUrl ? <img src={c.photoUrl} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" /> : <span className="h-10 w-14 shrink-0 rounded-md bg-muted" aria-hidden />}
          <span className="min-w-0">
            <span className="block truncate font-semibold">{c.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{c.plate || 'No plate yet'} · {c.status}</span>
          </span>
        </span>
      ),
    },
    { header: 'City', sortValue: (c) => c.hub?.name, cell: (c) => <span className="text-sm">{c.hub ? c.hub.name : 'No city'}</span> },
    {
      header: 'Insurance',
      sortValue: (c) => c.insurance,
      cell: (c) => (
        <span className="space-y-1">
          <Badge tone={INSURANCE_TONE[c.insurance]}>{INSURANCE_LABEL[c.insurance]}</Badge>
          <span className="block text-xs text-muted-foreground">
            {c.insurance === 'missing' && c.wheelbase?.missingSince ? `Missing since ${formatDateTime(c.wheelbase.missingSince)}. ` : ''}
            {c.bookable ? 'Guests can book it.' : 'Guests can’t book it.'}
          </span>
        </span>
      ),
    },
    {
      header: 'Wheelbase listing',
      hideOnMobile: true,
      cell: (c) =>
        c.wheelbase ? (
          <span className="block min-w-0 text-sm">
            <span className="block truncate font-medium">{c.wheelbase.name} <span className="text-xs text-muted-foreground tabular-nums">#{c.wheelbase.rentalId}</span></span>
            <span className="block truncate text-xs text-muted-foreground">
              {[c.wheelbase.insuranceState && `Wheelbase: ${c.wheelbase.insuranceState}`, c.wheelbase.planLabel, c.wheelbase.minRenterAge && `${c.wheelbase.minRenterAge}+ drivers`, c.wheelbase.linkedBy === 'import' ? 'Added from Wheelbase' : c.wheelbase.linkedBy === 'auto' ? 'Linked automatically' : 'Linked by staff']
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{INSURANCE_HELP.not_linked}</span>
        ),
    },
    {
      header: 'Link',
      cell: (c) => (
        <span className="flex min-w-[14rem] items-center gap-2">
          <ListingPicker
            car={c}
            listings={data?.listings ?? []}
            byId={listingsById}
            disabled={!data?.dealerId || !!data?.error || link.isPending}
            onPick={(rentalId) => link.mutate({ car: c, rentalId })}
          />
          {c.wheelbase && (
            <Button variant="ghost" size="sm" onClick={() => void unlink(c)} disabled={link.isPending}>Unlink</Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cars"
        title="Car insurance"
        description="Each car’s insurance is read from Wheelbase every few hours. Link every car to its Wheelbase listing; guests only see and book the cars Wheelbase has approved."
      />

      {data && <SyncStatus data={data} onSync={() => sync.mutate()} syncing={sync.isPending} />}

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Cars by insurance">
        <StatTile tone="success" label="Guests can book" value={q.data ? String(counts.bookable) : '–'} sub={`of ${inCity.length} cars`} />
        <StatTile tone={counts.not_linked ? 'warning' : 'default'} label="Not linked" value={q.data ? String(counts.not_linked) : '–'} />
        <StatTile tone={counts.not_approved ? 'destructive' : 'default'} label="Not approved" value={q.data ? String(counts.not_approved) : '–'} />
        <StatTile tone={counts.missing ? 'warning' : 'default'} label="Missing from Wheelbase" value={q.data ? String(counts.missing) : '–'} />
      </section>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Insurance">
            {FILTERS.map((f) => (
              <Chip key={f.key || 'all'} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</Chip>
            ))}
          </div>
          {cities.length > 1 && (
            <Select size="md" aria-label="City" value={hubId} onChange={(e) => setHubId(e.target.value)} wrapperClassName="ms-auto w-full sm:w-56">
              <option value="">Every city</option>
              {cities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={q.data ? rows : undefined}
          isLoading={q.isLoading}
          isError={q.isError}
          onRetry={() => void q.refetch()}
          errorMessage="We couldn’t load the cars’ insurance."
          emptyTitle={filter === 'attention' ? 'Every car is insured' : 'Nothing here'}
          emptyDescription={filter === 'attention' ? 'Every car is linked to Wheelbase and approved.' : 'Try another filter.'}
          caption={q.data ? `${rows.length} of ${inCity.length} cars` : undefined}
        />
      </div>

      {data && <WheelbaseBookings hubId={hubId} cars={data.cars} />}

      {data && <SettingsCard data={data} />}
    </div>
  );
}

function WheelbaseBookings({ hubId, cars }: { hubId: string; cars: WheelbaseCarRow[] }) {
  const q = useQuery({ queryKey: ['wheelbase-reservations', hubId], queryFn: () => adminApi.wheelbaseReservations(hubId || undefined) });
  const carName = useMemo(() => new Map(cars.map((c) => [c._id, c.name])), [cars]);
  const columns: Column<WheelbaseReservationRow>[] = [
    { header: 'Car', cell: (r) => (r.vehicleId ? carName.get(r.vehicleId) ?? 'Car' : <span className="text-warning">Listing {r.rentalId} not linked</span>) },
    { header: 'Dates', cell: (r) => reservationDates(r.period.start, r.period.end), sortValue: (r) => r.period.start },
    { header: 'Guest', cell: (r) => r.renterName || '–', hideOnMobile: true },
    { header: 'Status', cell: (r) => <Badge tone={RESERVATION_TONE[r.state]}>{RESERVATION_LABEL[r.state]}</Badge> },
    { header: 'Rental amount', numeric: true, cell: (r) => reservationAmount(r.amountCents, r.currency), sortValue: (r) => r.amountCents ?? 0 },
    { header: 'Wheelbase no.', cell: (r) => r._id, hideOnMobile: true },
  ];
  return (
    <section className="space-y-3" aria-labelledby="wb-bookings">
      <div>
        <h2 id="wb-bookings" className="text-lg font-semibold">Wheelbase bookings</h2>
        <p className="text-sm text-muted-foreground">Every trip booked and paid through Wheelbase arrives here on its own, blocks the car’s dates and counts in the city’s statement.</p>
      </div>
      <DataTable
        columns={columns}
        rows={q.data}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => void q.refetch()}
        errorMessage="We couldn’t load the Wheelbase bookings."
        emptyTitle="No Wheelbase bookings yet"
        emptyDescription="They appear here once the Zapier connection is on and a guest books."
        caption={q.data ? `${q.data.length} bookings` : undefined}
      />
    </section>
  );
}

function SyncStatus({ data, onSync, syncing }: { data: WheelbaseOverview; onSync: () => void; syncing: boolean }) {
  const notSetUp = !data.dealerId;
  const unreachable = !notSetUp && (!!data.error || data.sync?.lastError === 'unreachable');
  const last = data.sync?.lastOkAt;
  return (
    <Card className={notSetUp || unreachable ? 'border-warning/40' : undefined}>
      <CardContent className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
        {(notSetUp || unreachable) && <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden />}
        <div className="min-w-0 flex-1 text-sm">
          {notSetUp ? (
            <>
              <p className="font-semibold">Wheelbase isn’t set up</p>
              <p className="text-muted-foreground">
                {data.settings.requireApproved
                  ? 'Guests can’t see or book any car until the account number is added below.'
                  : 'Add the account number below to read each car’s insurance.'}
              </p>
            </>
          ) : unreachable ? (
            <>
              <p className="font-semibold">Wheelbase can’t be reached right now</p>
              <p className="text-muted-foreground">Each car keeps its last known insurance{last ? `, read ${formatDateTime(last)}` : ''}. Staff are alerted if this lasts {data.settings.staleAlertHours} hours.</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Wheelbase account {data.dealerId}</p>
              <p className="text-muted-foreground">
                {data.listings.length} listings in the account.{last ? ` Last read ${formatDateTime(last)}.` : ' Not read yet.'}
                {data.sync?.lastResult?.imported ? ` ${data.sync.lastResult.imported} added as cars on the last read.` : ''}
                {data.sync?.lastResult?.calendarErrors ? ` Booked dates couldn’t be read for ${data.sync.lastResult.calendarErrors} cars.` : ''}
              </p>
              {!!data.sync?.lastResult?.skipped?.length && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-medium">{data.sync.lastResult.skipped.length} listings not added yet</summary>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {data.sync.lastResult.skipped.map((x) => <li key={x.rentalId}>{x.name} #{x.rentalId}: {x.reason}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
        <Button variant="outline" onClick={onSync} loading={syncing} disabled={notSetUp}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Check Wheelbase now
        </Button>
      </CardContent>
    </Card>
  );
}

function ListingPicker({ car, listings, byId, disabled, onPick }: {
  car: WheelbaseCarRow;
  listings: WheelbaseListingRow[];
  byId: Map<number, WheelbaseListingRow>;
  disabled: boolean;
  onPick: (rentalId: number) => void;
}) {
  const suggested = car.suggestions.map((id) => byId.get(id)).filter((l): l is WheelbaseListingRow => !!l);
  const rest = listings.filter((l) => !car.suggestions.includes(l.id));
  const label = (l: WheelbaseListingRow) => `${l.name} #${l.id}${l.insuranceState ? ` · ${l.insuranceState}` : ''}`;
  return (
    <Select
      size="sm"
      aria-label={`Wheelbase listing for ${car.name}`}
      value={car.wheelbase ? String(car.wheelbase.rentalId) : ''}
      disabled={disabled || listings.length === 0}
      onChange={(e) => e.target.value && onPick(Number(e.target.value))}
    >
      <option value="">{listings.length ? 'Choose a listing' : 'No listings'}</option>
      {car.wheelbase && !byId.has(car.wheelbase.rentalId) && <option value={car.wheelbase.rentalId}>{car.wheelbase.name} #{car.wheelbase.rentalId} · missing</option>}
      {suggested.length > 0 && (
        <optgroup label="Same year, make and model">
          {suggested.map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}
        </optgroup>
      )}
      <optgroup label="Every listing">
        {rest.map((l) => <option key={l.id} value={l.id}>{label(l)}</option>)}
      </optgroup>
    </Select>
  );
}

function SettingsCard({ data }: { data: WheelbaseOverview }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFrom(data));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setDraft(draftFrom(data)), [data]);

  const hours = (v: string) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 720;
  const within = (v: string, min: number, max: number) => Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max;
  const valid = /^\d{0,20}$/.test(draft.dealerId.trim()) && hours(draft.missingGraceHours) && hours(draft.staleAlertHours)
    && within(draft.syncMinutes, 5, 1440) && within(draft.calendarDays, 30, 365);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(data));

  const save = useMutation({
    mutationFn: () =>
      adminApi.saveConfig({
        insurance: {
          wheelbaseDealerId: draft.dealerId.trim(),
          requireApproved: draft.requireApproved,
          enforceMinAge: draft.enforceMinAge,
          autoLink: draft.autoLink,
          importListings: draft.importListings,
          syncMinutes: Number(draft.syncMinutes),
          calendarDays: Number(draft.calendarDays),
          missingGraceHours: Number(draft.missingGraceHours),
          staleAlertHours: Number(draft.staleAlertHours),
        },
        reason: 'Car insurance settings',
      }),
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['wheelbase-overview'] });
      void qc.invalidateQueries({ queryKey: ['platform-config'] });
      toast({ tone: 'success', title: 'Saved', description: 'Wheelbase is read again with the new settings.' });
    },
    onError: (e) => setError(fail(e, 'We couldn’t save these settings.')),
  });

  const toggle = (key: 'requireApproved' | 'enforceMinAge' | 'autoLink' | 'importListings', label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
      <input type="checkbox" className="mt-0.5 accent-[hsl(var(--primary))]" checked={draft[key]} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.checked }))} />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-muted-foreground">{hint}</span>
      </span>
    </label>
  );

  return (
    <Card>
      <CardHeader><CardTitle>Wheelbase settings</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Wheelbase account number" hint="The dealer ID in Wheelbase. Digits only.">
            <Input inputMode="numeric" value={draft.dealerId} onChange={(e) => setDraft((d) => ({ ...d, dealerId: e.target.value }))} />
          </Field>
          <Field label="Missing listing grace (hours)" hint="A car whose listing leaves the account stays bookable this long.">
            <Input type="number" min={1} max={720} value={draft.missingGraceHours} onChange={(e) => setDraft((d) => ({ ...d, missingGraceHours: e.target.value }))} />
          </Field>
          <Field label="Alert staff after (hours)" hint="When Wheelbase hasn’t been read for this long.">
            <Input type="number" min={1} max={720} value={draft.staleAlertHours} onChange={(e) => setDraft((d) => ({ ...d, staleAlertHours: e.target.value }))} />
          </Field>
          <Field label="Read Wheelbase every (minutes)" hint="Cars, insurance and booked dates. 5 to 1440.">
            <Input type="number" min={5} max={1440} value={draft.syncMinutes} onChange={(e) => setDraft((d) => ({ ...d, syncMinutes: e.target.value }))} />
          </Field>
          <Field label="Copy booked dates for (days ahead)" hint="How far ahead search knows a car is taken. 30 to 365.">
            <Input type="number" min={30} max={365} value={draft.calendarDays} onChange={(e) => setDraft((d) => ({ ...d, calendarDays: e.target.value }))} />
          </Field>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {toggle('requireApproved', 'Approved cars only', 'Guests only see and book cars Wheelbase has approved. Turning this off lets uninsured cars be booked.')}
          {toggle('enforceMinAge', 'Driver minimum age', 'Refuse a driver younger than the car’s Wheelbase minimum, at booking and again at pickup.')}
          {toggle('importListings', 'Add Wheelbase cars automatically', 'Every listing in the account becomes a car in the CrossCubes city that covers it, with its photos and price. A car you delete is not added back.')}
          {toggle('autoLink', 'Link cars automatically', 'Link a car to the one listing with its year, make and model. Keep this off while the account also holds another company’s cars.')}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || !valid}>Save settings</Button>
        </div>
      </CardContent>
    </Card>
  );
}
