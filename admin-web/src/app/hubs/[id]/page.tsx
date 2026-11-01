'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Circle, Copy, KeyRound, Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { adminApi } from '@/features/admin/api';
import { HUB_STATUS_LABEL, HUB_STATUS_TONE, LICENCE_LABEL, type HubDetail, type HubLicence, type LicenceKind } from '@/features/hubs/types';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';
import { HubForm } from '../../../features/hubs/hub-form';

const fail = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const DAY = 86_400_000;

const EVENT_LABEL: Record<string, string> = {
  created: 'Hub created',
  updated: 'Details changed',
  operator_assigned: 'Franchisee login created',
  licence_added: 'Licence added',
  licence_removed: 'Licence removed',
  live: 'Went live',
  paused: 'Paused',
  closed: 'Closed',
};

function expiry(l: HubLicence, now = Date.now()): { tone: 'success' | 'warning' | 'destructive' | 'muted'; text: string } {
  if (!l.expiresAt) return { tone: 'muted', text: 'No expiry' };
  const left = new Date(l.expiresAt).getTime() - now;
  if (left <= 0) return { tone: 'destructive', text: `Expired ${formatDate(l.expiresAt)}` };
  if (left <= 30 * DAY) return { tone: 'warning', text: `Expires ${formatDate(l.expiresAt)}` };
  return { tone: 'success', text: `Valid to ${formatDate(l.expiresAt)}` };
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export default function HubDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const q = useQuery({ queryKey: ['hub', id], queryFn: () => adminApi.hub(id) });
  const [editing, setEditing] = useState(false);
  const [login, setLogin] = useState({ name: '', email: '' });
  const [issued, setIssued] = useState<{ username: string; password?: string } | null>(null);
  const [lic, setLic] = useState<{ kind: LicenceKind; label: string; number: string; expiresAt: string }>({ kind: 'insurance', label: '', number: '', expiresAt: '' });
  const [licError, setLicError] = useState<string | null>(null);

  const refresh = (hub?: HubDetail | unknown) => {
    if (hub && typeof hub === 'object' && '_id' in hub) qc.setQueryData(['hub', id], (old: HubDetail | undefined) => ({ ...(old ?? {}), ...(hub as HubDetail) }));
    void qc.invalidateQueries({ queryKey: ['hub', id] });
    void qc.invalidateQueries({ queryKey: ['hub-overview'] });
  };

  const status = useMutation({
    mutationFn: (v: { status: 'live' | 'paused' | 'closed'; note?: string }) => adminApi.setHubStatus(id, v.status, v.note),
    onSuccess: (hub, v) => {
      refresh(hub);
      toast({ tone: 'success', title: v.status === 'live' ? `${hub.name} is live` : v.status === 'paused' ? `${hub.name} is paused` : `${hub.name} is closed` });
    },
    onError: (e) => toast({ tone: 'error', title: fail(e, 'We couldn’t change the hub’s status.') }),
  });
  const createLogin = useMutation({
    mutationFn: () => adminApi.createHubLogin(id, { name: login.name.trim(), email: login.email.trim() }),
    onSuccess: (res) => {
      setIssued(res);
      refresh();
    },
    onError: (e) => toast({ tone: 'error', title: fail(e, 'We couldn’t create the login.') }),
  });
  const addLicence = useMutation({
    mutationFn: () => adminApi.addHubLicence(id, { kind: lic.kind, label: lic.label.trim(), number: lic.number.trim() || undefined, expiresAt: lic.expiresAt || undefined }),
    onSuccess: (hub) => {
      refresh(hub);
      setLic({ kind: 'insurance', label: '', number: '', expiresAt: '' });
      toast({ tone: 'success', title: 'Licence added' });
    },
    onError: (e) => setLicError(fail(e, 'We couldn’t add the licence.')),
  });
  const removeLicence = useMutation({
    mutationFn: (licenceId: string) => adminApi.removeHubLicence(id, licenceId),
    onSuccess: (hub) => refresh(hub),
    onError: (e) => toast({ tone: 'error', title: fail(e, 'We couldn’t remove the licence.') }),
  });

  if (q.isError && !q.data) return <ErrorState message="We couldn’t load this hub." retry={() => void q.refetch()} />;
  if (!q.data)
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-16 w-80" />
        <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-72 w-full rounded-lg lg:col-span-2" /><Skeleton className="h-72 w-full rounded-lg" /></div>
      </div>
    );

  const hub = q.data;
  const closed = hub.status === 'closed';
  const blockers = hub.launchBlockers ?? [];
  const fees = hub.economics.royaltyPct + hub.economics.techFeePct + hub.economics.marketingFundPct;
  const [lng, lat] = hub.territory.center.coordinates;

  const askReason = async (title: string, label: string, tone: 'default' | 'destructive', requireText?: string) =>
    confirm({ title, tone, confirmLabel: title.replace(/\?$/, ''), reason: { label, required: true }, requireText });

  const checklist = [
    { done: !!hub.operatorUserId, text: 'Franchisee login created' },
    { done: !!hub.agreement.signedAt, text: 'Franchise agreement signed' },
    { done: !blockers.some((b) => b.includes('insurance')), text: 'Fleet insurance on file and in date' },
    { done: !blockers.some((b) => b.includes('business licence')), text: 'Business licence on file' },
  ];

  return (
    <div className="space-y-6">
      <Link href={adminPath('hubs')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Hub network
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-16 shrink-0 place-items-center rounded-lg bg-ink font-display text-lg font-bold tracking-wide text-background">{hub.code}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold">{hub.name}</h1>
              <Badge tone={HUB_STATUS_TONE[hub.status]}>{HUB_STATUS_LABEL[hub.status]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{hub.franchisee.legalName} · {hub.city}, {hub.state}{hub.launchedAt ? ` · live since ${formatDate(hub.launchedAt)}` : ''}</p>
          </div>
        </div>
        {!closed && (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {(hub.status === 'setup' || hub.status === 'paused') && (
              <Button
                disabled={blockers.length > 0}
                loading={status.isPending && status.variables?.status === 'live'}
                onClick={async () => {
                  if ((await confirm({ title: `Put ${hub.name} live?`, description: 'Its cars appear in search and guests can book them straight away.', confirmLabel: 'Go live' })).ok) status.mutate({ status: 'live' });
                }}
              >
                {hub.status === 'paused' ? 'Resume bookings' : 'Go live'}
              </Button>
            )}
            {hub.status === 'live' && (
              <Button
                variant="outline"
                loading={status.isPending && status.variables?.status === 'paused'}
                onClick={async () => {
                  const r = await askReason('Pause this hub?', 'Why? The franchisee sees this.', 'default');
                  if (r.ok) status.mutate({ status: 'paused', note: r.reason });
                }}
              >
                Pause
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}><Pencil className="h-4 w-4" aria-hidden /> {editing ? 'Stop editing' : 'Edit details'}</Button>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              loading={status.isPending && status.variables?.status === 'closed'}
              onClick={async () => {
                const r = await askReason('Close this hub?', 'Why is it closing?', 'destructive', hub.code);
                if (r.ok) status.mutate({ status: 'closed', note: r.reason });
              }}
            >
              Close hub
            </Button>
          </div>
        )}
      </header>

      {editing ? (
        <div className="max-w-3xl">
          <HubForm
            hub={hub}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              const updated = await adminApi.updateHub(id, input);
              refresh(updated);
              setEditing(false);
              toast({ tone: 'success', title: 'Hub saved' });
            }}
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3 [&>*]:min-w-0">
          <div className="space-y-6 lg:col-span-2">
            {hub.status === 'setup' && (
              <Card>
                <CardHeader><CardTitle>Launch checklist</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <ol className="space-y-3">
                    {checklist.map((c) => (
                      <li key={c.text} className="flex items-center gap-3 text-sm">
                        {c.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
                        <span className={c.done ? 'text-muted-foreground line-through' : 'font-medium'}>{c.text}</span>
                        <span className="sr-only">{c.done ? 'done' : 'to do'}</span>
                      </li>
                    ))}
                  </ol>
                  {blockers.length === 0 ? (
                    <p className="rounded-sm bg-success/10 p-3 text-sm font-medium text-success">Everything is in place. Press Go live when the franchisee is ready to take bookings.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-muted-foreground">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>Licences and insurance</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {hub.licences.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing on file yet. The hub needs fleet insurance and a business licence before it can go live.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {hub.licences.map((l) => {
                      const e = expiry(l);
                      return (
                        <li key={l._id} className="flex items-center gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{l.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{LICENCE_LABEL[l.kind]}{l.number ? ` · ${l.number}` : ''}</p>
                          </div>
                          <Badge tone={e.tone}>{e.text}</Badge>
                          {!closed && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${l.label}`}
                              loading={removeLicence.isPending && removeLicence.variables === l._id}
                              onClick={async () => {
                                if ((await confirm({ title: `Remove ${l.label}?`, tone: 'destructive', confirmLabel: 'Remove' })).ok) removeLicence.mutate(l._id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!closed && (
                  <form
                    className="grid gap-3 rounded-lg bg-subtle p-4 sm:grid-cols-2"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      if (lic.label.trim().length < 2) return setLicError('Give it a name, like “Fleet policy 2026”.');
                      setLicError(null);
                      addLicence.mutate();
                    }}
                  >
                    <Field label="Type" htmlFor="lic-kind">
                      <Select id="lic-kind" value={lic.kind} onChange={(e) => setLic((p) => ({ ...p, kind: e.target.value as LicenceKind }))}>
                        {Object.entries(LICENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </Field>
                    <Field label="Name" htmlFor="lic-label" error={licError ?? undefined}><Input id="lic-label" value={lic.label} onChange={(e) => setLic((p) => ({ ...p, label: e.target.value }))} placeholder="Fleet policy 2026" /></Field>
                    <Field label="Number" htmlFor="lic-number"><Input id="lic-number" value={lic.number} onChange={(e) => setLic((p) => ({ ...p, number: e.target.value }))} /></Field>
                    <Field label="Expires" htmlFor="lic-exp"><Input id="lic-exp" type="date" value={lic.expiresAt} onChange={(e) => setLic((p) => ({ ...p, expiresAt: e.target.value }))} /></Field>
                    <div className="sm:col-span-2 flex justify-end"><Button type="submit" variant="secondary" loading={addLicence.isPending}>Add licence</Button></div>
                  </form>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Territory and money</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Detail label="Area"><span className="tabular-nums">{hub.territory.radiusMiles} mile radius</span>{hub.territory.exclusive ? ', exclusive' : ''}</Detail>
                  <Detail label="Centre"><span className="tabular-nums">{lat.toFixed(4)}, {lng.toFixed(4)}</span></Detail>
                  <Detail label="Time zone">{hub.timezone.replace('_', ' ')}</Detail>
                  <Detail label="Royalty"><span className="tabular-nums">{hub.economics.royaltyPct}%</span></Detail>
                  <Detail label="Technology fee"><span className="tabular-nums">{hub.economics.techFeePct}%</span></Detail>
                  <Detail label="Marketing fund"><span className="tabular-nums">{hub.economics.marketingFundPct}%</span></Detail>
                  <Detail label="Total to HQ"><span className="font-semibold tabular-nums">{fees}% of gross</span></Detail>
                  <Detail label="Agreement signed">{hub.agreement.signedAt ? formatDate(hub.agreement.signedAt) : <span className="text-warning">Not yet</span>}</Detail>
                  <Detail label="Term">{hub.agreement.termYears} years{hub.agreement.endsAt ? `, to ${formatDate(hub.agreement.endsAt)}` : ''}</Detail>
                </dl>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Franchisee login</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {issued ? (
                  <div className="space-y-3" role="status">
                    <p className="text-sm">Send these to <span className="font-medium">{hub.franchisee.contactName}</span>. They sign in on the hub portal.</p>
                    <dl className="space-y-2 rounded-lg bg-subtle p-3 font-mono text-sm">
                      <div><dt className="text-xs font-sans font-semibold text-muted-foreground">Username</dt><dd className="break-all">{issued.username}</dd></div>
                      {issued.password && <div><dt className="text-xs font-sans font-semibold text-muted-foreground">Password</dt><dd className="break-all">{issued.password}</dd></div>}
                    </dl>
                    {issued.password ? (
                      <>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(`${issued.username}\n${issued.password}`);
                              toast({ tone: 'success', title: 'Copied' });
                            } catch {
                              toast({ tone: 'error', title: 'Copy didn’t work. Select the text instead.' });
                            }
                          }}
                        >
                          <Copy className="h-4 w-4" aria-hidden /> Copy both
                        </Button>
                        <p className="text-xs text-warning">This password is shown once. It isn’t stored anywhere we can read it back.</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">They already had an account, so they keep their own password.</p>
                    )}
                  </div>
                ) : hub.operatorUserId ? (
                  <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Login created. The franchisee signs in on the hub portal.</p>
                ) : closed ? (
                  <p className="text-sm text-muted-foreground">This hub is closed.</p>
                ) : (
                  <form
                    className="space-y-3"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      if (login.name.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(login.email.trim())) return toast({ tone: 'error', title: 'Add their name and a valid email.' });
                      createLogin.mutate();
                    }}
                  >
                    <Field label="Their name" htmlFor="op-name"><Input id="op-name" value={login.name} onChange={(e) => setLogin((p) => ({ ...p, name: e.target.value }))} placeholder={hub.franchisee.contactName} /></Field>
                    <Field label="Sign-in email" htmlFor="op-email"><Input id="op-email" type="email" value={login.email} onChange={(e) => setLogin((p) => ({ ...p, email: e.target.value }))} placeholder={hub.franchisee.email} /></Field>
                    <Button type="submit" className="w-full" loading={createLogin.isPending}><KeyRound className="h-4 w-4" aria-hidden /> Create login</Button>
                  </form>
                )}
                <dl className="space-y-2 border-t border-border pt-4 text-sm">
                  <Detail label="Company">{hub.franchisee.legalName}</Detail>
                  <Detail label="Contact">{hub.franchisee.contactName}</Detail>
                  <Detail label="Email"><a className="break-all text-primary hover:underline" href={`mailto:${hub.franchisee.email}`}>{hub.franchisee.email}</a></Detail>
                  {hub.franchisee.phone && <Detail label="Phone"><a className="text-primary hover:underline" href={`tel:${hub.franchisee.phone}`}>{hub.franchisee.phone}</a></Detail>}
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>History</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {[...hub.timeline].reverse().map((t, i) => (
                    <li key={`${t.at}-${i}`} className="text-sm">
                      <p className="font-medium">{EVENT_LABEL[t.event] ?? t.event}</p>
                      {t.note && <p className="text-muted-foreground">{t.note}</p>}
                      <p className="text-xs text-muted-foreground">{formatDateTime(t.at)}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
