'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { PersonCard } from '@/components/people/person-card';
import { adminApi } from '@/features/admin/api';
import { mapsApi } from '@/features/maps/api';
import { APPLICATION_STATUS_LABEL, START_LABEL, type HubRejectionReason } from '@/features/hubs/applications-api';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';
import { APPLICATION_TONE } from '../../../features/hubs/labels';

const fail = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const TIMEZONES = [['America/New_York', 'Eastern'], ['America/Chicago', 'Central'], ['America/Denver', 'Mountain'], ['America/Phoenix', 'Arizona'], ['America/Los_Angeles', 'Pacific'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii']] as const;

export default function HubApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['hub-application', id], queryFn: () => adminApi.hubApplication(id) });
  const settings = useQuery({ queryKey: ['admin-config'], queryFn: () => adminApi.config(), staleTime: 5 * 60_000 });
  const [hub, setHub] = useState({ code: '', name: '', timezone: 'America/Chicago', place: '', lat: '', lng: '', radiusMiles: '35', exclusive: true, sharePct: '' });
  const [found, setFound] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState('');
  const [reasons, setReasons] = useState<HubRejectionReason[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const a = q.data.applicant;
    setHub((h) => (h.name ? h : { ...h, name: a.city, code: a.city.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(), place: `${a.city}, ${a.state}` }));
  }, [q.data]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['hub-application', id] });
    void qc.invalidateQueries({ queryKey: ['hub-applications'] });
    void qc.invalidateQueries({ queryKey: ['hub-overview'] });
  };
  const approve = useMutation({
    mutationFn: () =>
      adminApi.approveHubApplication(id, {
        hub: {
          code: hub.code.trim().toUpperCase(),
          name: hub.name.trim(),
          timezone: hub.timezone,
          territory: { lng: Number(hub.lng), lat: Number(hub.lat), radiusMiles: Number(hub.radiusMiles), exclusive: hub.exclusive },
          economics: hub.sharePct.trim() === '' ? undefined : { holderShareBps: Math.round(Number(hub.sharePct) * 100) },
        },
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      refresh();
      toast({ tone: 'success', title: 'Approved', description: 'The applicant has been asked to pay the licence.' });
    },
    onError: (e) => setError(fail(e, 'We couldn’t approve this application.')),
  });
  const reject = useMutation({
    mutationFn: () => adminApi.rejectHubApplication(id, { reasons, note: note.trim() || undefined }),
    onSuccess: () => {
      refresh();
      toast({ tone: 'success', title: 'Declined', description: 'The applicant can see why and what to change.' });
    },
    onError: (e) => setError(fail(e, 'We couldn’t decline this application.')),
  });

  async function findCentre() {
    setFinding(true);
    try {
      const [hit] = await mapsApi.geocode(hub.place.trim());
      if (!hit) return setError('We couldn’t find that place. Try the city and state.');
      setHub((h) => ({ ...h, lat: hit.lat.toFixed(5), lng: hit.lng.toFixed(5) }));
      setFound(hit.formatted);
      setError(null);
    } catch {
      setError('Place search isn’t working right now. Try again in a moment.');
    } finally {
      setFinding(false);
    }
  }

  if (q.isError && !q.data) return <ErrorState message="We couldn’t load this application." retry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96 w-full rounded-lg" />;
  const app = q.data;
  const a = app.applicant;
  const open = app.status === 'submitted';
  const ready = /^[A-Za-z]{2,6}$/.test(hub.code.trim()) && hub.name.trim().length > 1 && hub.lat !== '' && Number(hub.radiusMiles) >= 1;

  return (
    <div className="space-y-6">
      <Link href={adminPath('hub-applications')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden /> City applications</Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold">{a.city}, {a.state}</h1>
        <Badge tone={APPLICATION_TONE[app.status]}>{APPLICATION_STATUS_LABEL[app.status]}</Badge>
        <span className="text-sm text-muted-foreground">{app.reference} · sent {formatDate(app.createdAt)}</span>
      </header>

      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>The application</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid gap-4 sm:grid-cols-3">
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cars, year 1</dt><dd className="mt-1 tabular-nums">{a.carsFirstYear}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Can start</dt><dd className="mt-1">{START_LABEL[a.startTimeline]}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Registered business</dt><dd className="mt-1">{a.hasBusinessEntity ? `Yes${a.companyName ? `, ${a.companyName}` : ''}` : 'Not yet'}</dd></div>
              </dl>
              <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">About them</p><p className="mt-1 whitespace-pre-wrap">{a.about}</p></div>
            </CardContent>
          </Card>

          {open ? (
            <>
              <Card>
                <CardHeader><CardTitle>Approve and set up the hub</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Hub name" htmlFor="h-name"><Input id="h-name" value={hub.name} onChange={(e) => setHub((h) => ({ ...h, name: e.target.value }))} /></Field>
                    <Field label="Short code" htmlFor="h-code" hint="2 to 6 letters."><Input id="h-code" value={hub.code} maxLength={6} onChange={(e) => setHub((h) => ({ ...h, code: e.target.value.toUpperCase() }))} className="font-mono uppercase" /></Field>
                    <Field label="Time zone" htmlFor="h-tz"><Select id="h-tz" value={hub.timezone} onChange={(e) => setHub((h) => ({ ...h, timezone: e.target.value }))}>{TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
                  </div>
                  <Field label="Centre of the area" htmlFor="h-place" hint={found ? `Centre set: ${found}` : 'Find the centre, then set how far the area reaches.'}>
                    <div className="flex gap-2">
                      <Input id="h-place" value={hub.place} onChange={(e) => setHub((h) => ({ ...h, place: e.target.value }))} />
                      <Button type="button" variant="outline" loading={finding} onClick={() => void findCentre()}><MapPin className="h-4 w-4" aria-hidden /> Find</Button>
                    </div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Radius in miles" htmlFor="h-r"><Input id="h-r" inputMode="decimal" value={hub.radiusMiles} onChange={(e) => setHub((h) => ({ ...h, radiusMiles: e.target.value }))} className="tabular-nums" /></Field>
                    <Field label="Holder’s share %" htmlFor="h-share" hint={settings.data?.hubs ? `Blank uses ${settings.data.hubs.holderShareBps / 100}%.` : 'Blank uses the platform setting.'}><Input id="h-share" inputMode="decimal" value={hub.sharePct} onChange={(e) => setHub((h) => ({ ...h, sharePct: e.target.value }))} className="tabular-nums" /></Field>
                    <label className="flex items-start gap-3 rounded-sm border border-border p-3 text-sm sm:mt-6">
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={hub.exclusive} onChange={(e) => setHub((h) => ({ ...h, exclusive: e.target.checked }))} />
                      <span>Exclusive area</span>
                    </label>
                  </div>
                  <Field label="Note to the applicant" htmlFor="h-note" hint="Optional. They see it on their application page."><Textarea id="h-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  <div className="flex justify-end">
                    <Button
                      disabled={!ready}
                      loading={approve.isPending}
                      onClick={async () => {
                        const price = settings.data?.hubs ? formatMoney({ amount: settings.data.hubs.licenceFeeCents, currency: 'USD' }) : 'the licence';
                        if ((await confirm({ title: `Approve ${a.fullName} for ${hub.name}?`, description: `We create the hub and ask them to pay ${price}. Their portal opens once it’s paid.`, confirmLabel: 'Approve' })).ok) approve.mutate();
                      }}
                    >
                      Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Or decline</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <fieldset className="grid gap-2 sm:grid-cols-2">
                    <legend className="mb-2 text-sm font-medium">Why? They see these, with what to improve.</legend>
                    {(Object.keys(app.reasons) as HubRejectionReason[]).map((r) => (
                      <label key={r} className="flex items-start gap-2 rounded-sm border border-border p-3 text-sm">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={reasons.includes(r)} onChange={(e) => setReasons((p) => (e.target.checked ? [...p, r] : p.filter((x) => x !== r)))} />
                        <span>{app.reasons[r].why}</span>
                      </label>
                    ))}
                  </fieldset>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={reasons.length === 0}
                      loading={reject.isPending}
                      onClick={async () => {
                        if ((await confirm({ title: 'Decline this application?', description: 'The applicant sees your reasons and your note.', confirmLabel: 'Decline', tone: 'destructive' })).ok) reject.mutate();
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="space-y-2 p-6 text-sm">
                {app.hubId && <p><Link href={adminPath(`hubs/${app.hubId}`)} className="font-semibold text-primary hover:underline">Open the hub</Link></p>}
                {app.decision?.note && <p><span className="font-semibold">Note:</span> {app.decision.note}</p>}
                {app.status === 'rejected' && <ul className="list-disc ps-5">{(app.decision?.reasons ?? []).map((r) => <li key={r}>{app.reasons[r].why}</li>)}</ul>}
                {app.payment?.paidAt && <p>Licence paid {formatDate(app.payment.paidAt)}.</p>}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {app.account && <PersonCard person={app.account} />}
          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {[...app.timeline].reverse().map((t, i) => (
                  <li key={`${t.at}-${i}`} className="text-sm">
                    <p className="font-medium capitalize">{t.event}</p>
                    {t.note && <p className="text-muted-foreground">{t.note}</p>}
                    <p className="text-xs text-muted-foreground">{formatDateTime(t.at)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
