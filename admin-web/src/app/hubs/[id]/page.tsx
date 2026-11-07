'use client';

import { useState, type ReactNode } from 'react';
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
import { bpsToPercent, DOCUMENT_LABEL, HUB_STATUS_LABEL, HUB_STATUS_TONE, type DocumentKind, type HubDetail, type HubDocument } from '@/features/hubs/types';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatDateTime, formatMoney } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';
import { HubForm } from '../../../features/hubs/hub-form';
import { HubPayoutsCard } from '../../../features/hubs/payouts-card';
import { DeliverySpotsCard } from '../../../features/hubs/delivery-spots-card';

const fail = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const DAY = 86_400_000;
const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });

const EVENT_LABEL: Record<string, string> = {
  created: 'Hub created',
  updated: 'Details changed',
  operator_assigned: 'Licence holder login created',
  licence_paid: 'Licence paid',
  document_added: 'Document added',
  document_removed: 'Document removed',
  live: 'Went live',
  paused: 'Paused',
  closed: 'Closed',
};

function expiry(iso: string | undefined, now = Date.now()): { tone: 'success' | 'warning' | 'destructive' | 'muted'; text: string } {
  if (!iso) return { tone: 'muted', text: 'No expiry' };
  const left = new Date(iso).getTime() - now;
  if (left <= 0) return { tone: 'destructive', text: `Expired ${formatDate(iso)}` };
  if (left <= 30 * DAY) return { tone: 'warning', text: `Ends ${formatDate(iso)}` };
  return { tone: 'success', text: `Valid to ${formatDate(iso)}` };
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
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
  const settings = useQuery({ queryKey: ['admin-config'], queryFn: () => adminApi.config(), staleTime: 5 * 60_000 });
  const [editing, setEditing] = useState(false);
  const [login, setLogin] = useState({ name: '', email: '' });
  const [issued, setIssued] = useState<{ username: string; password?: string } | null>(null);
  const [doc, setDoc] = useState<{ kind: DocumentKind; label: string; number: string; expiresAt: string }>({ kind: 'insurance', label: '', number: '', expiresAt: '' });
  const [docError, setDocError] = useState<string | null>(null);
  const [pay, setPay] = useState({ paidAt: '', amount: '', reference: '' });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['hub', id] });
    void qc.invalidateQueries({ queryKey: ['hub-overview'] });
  };

  const status = useMutation({
    mutationFn: (v: { status: 'live' | 'paused' | 'closed'; note?: string }) => adminApi.setHubStatus(id, v.status, v.note),
    onSuccess: (hub, v) => {
      refresh();
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
  const recordPayment = useMutation({
    mutationFn: () =>
      adminApi.recordLicencePayment(id, {
        paidAt: pay.paidAt || undefined,
        feeCents: pay.amount.trim() === '' ? undefined : Math.round(Number(pay.amount) * 100),
        reference: pay.reference.trim() || undefined,
      }),
    onSuccess: (hub) => {
      refresh();
      setPay({ paidAt: '', amount: '', reference: '' });
      toast({ tone: 'success', title: 'Licence payment recorded', description: hub.licence.expiresAt ? `Valid to ${formatDate(hub.licence.expiresAt)}.` : undefined });
    },
    onError: (e) => toast({ tone: 'error', title: fail(e, 'We couldn’t record the payment.') }),
  });
  const addDocument = useMutation({
    mutationFn: () => adminApi.addHubDocument(id, { kind: doc.kind, label: doc.label.trim(), number: doc.number.trim() || undefined, expiresAt: doc.expiresAt || undefined }),
    onSuccess: () => {
      refresh();
      setDoc({ kind: 'insurance', label: '', number: '', expiresAt: '' });
      toast({ tone: 'success', title: 'Document added' });
    },
    onError: (e) => setDocError(fail(e, 'We couldn’t add the document.')),
  });
  const removeDocument = useMutation({
    mutationFn: (documentId: string) => adminApi.removeHubDocument(id, documentId),
    onSuccess: () => refresh(),
    onError: (e) => toast({ tone: 'error', title: fail(e, 'We couldn’t remove the document.') }),
  });

  if (q.isError && !q.data) return <ErrorState message="We couldn’t load this hub." retry={() => void q.refetch()} />;
  if (!q.data)
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-16 w-80" />
        <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-72 w-full rounded-lg lg:col-span-2" /><Skeleton className="h-72 w-full rounded-lg" /></div>
      </div>
    );

  const hub: HubDetail = q.data;
  const closed = hub.status === 'closed';
  const blockers = hub.launchBlockers ?? [];
  const [lng, lat] = hub.territory.center.coordinates;
  const price = settings.data?.hubs?.licenceFeeCents;
  const licence = expiry(hub.licence?.expiresAt);
  const defaultSharePct = settings.data?.hubs ? settings.data.hubs.holderShareBps / 100 : undefined;

  const askReason = async (title: string, label: string, tone: 'default' | 'destructive', requireText?: string) =>
    confirm({ title, tone, confirmLabel: title.replace(/\?$/, ''), reason: { label, required: true }, requireText });

  const checklist = [
    { done: !!hub.operatorUserId, text: 'Licence holder login created' },
    { done: !blockers.some((b) => b.includes('licence payment') || b.includes('licence ran out')), text: 'Licence paid and in date' },
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
            <p className="text-sm text-muted-foreground">{hub.holder.legalName} · {hub.city}, {hub.state}{hub.launchedAt ? ` · live since ${formatDate(hub.launchedAt)}` : ''}</p>
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
                  const r = await askReason('Pause this hub?', 'Why? The licence holder sees this.', 'default');
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
            defaultSharePct={defaultSharePct}
            submitLabel="Save changes"
            onSubmit={async (input) => {
              await adminApi.updateHub(id, input);
              refresh();
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
                    <p className="rounded-sm bg-success/10 p-3 text-sm font-medium text-success">Everything is in place. Press Go live when the holder is ready to take bookings.</p>
                  ) : (
                    <ul className="space-y-1 text-sm text-muted-foreground">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle>City licence</CardTitle>
                <Badge tone={hub.licence?.expiresAt ? licence.tone : 'muted'}>{hub.licence?.expiresAt ? licence.text : 'Not paid yet'}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  One licence covers {settings.data?.hubs?.licenceTermMonths ?? 12} months{price !== undefined ? ` for ${usd(price)}` : ''}. A renewal starts when the current licence ends, so paying early loses no days. If it runs out, the hub pauses until it’s renewed.
                </p>
                {hub.licence?.terms?.length ? (
                  <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                    {[...hub.licence.terms].reverse().map((t, i) => (
                      <li key={`${t.paidAt}-${i}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        <span><span className="font-medium tabular-nums">{usd(t.feeCents)}</span> paid {formatDate(t.paidAt)}{t.reference ? <span className="text-muted-foreground"> · {t.reference}</span> : null}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{formatDate(t.startsAt)} to {formatDate(t.expiresAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {!closed && (
                  <form
                    className="grid gap-3 rounded-lg bg-subtle p-4 sm:grid-cols-3"
                    onSubmit={async (ev) => {
                      ev.preventDefault();
                      if (pay.amount.trim() !== '' && !(Number(pay.amount) >= 0)) return toast({ tone: 'error', title: 'Enter the amount in dollars, like 1000.' });
                      if ((await confirm({ title: 'Record this licence payment?', description: `It adds ${settings.data?.hubs?.licenceTermMonths ?? 12} months to ${hub.name}’s licence.`, confirmLabel: 'Record payment' })).ok) recordPayment.mutate();
                    }}
                  >
                    <Field label="Paid on" htmlFor="pay-date" hint="Blank means today."><Input id="pay-date" type="date" value={pay.paidAt} onChange={(e) => setPay((p) => ({ ...p, paidAt: e.target.value }))} /></Field>
                    <Field label="Amount (USD)" htmlFor="pay-amount" hint={price !== undefined ? `Blank means ${usd(price)}.` : undefined}><Input id="pay-amount" inputMode="decimal" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} className="tabular-nums" /></Field>
                    <Field label="Reference" htmlFor="pay-ref" hint="Wire or receipt number."><Input id="pay-ref" value={pay.reference} onChange={(e) => setPay((p) => ({ ...p, reference: e.target.value }))} /></Field>
                    <div className="flex justify-end sm:col-span-3"><Button type="submit" variant="secondary" loading={recordPayment.isPending}>Record payment</Button></div>
                  </form>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Insurance and documents</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {hub.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing on file yet. The hub needs fleet insurance and a business licence before it can go live.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {hub.documents.map((d: HubDocument) => {
                      const e = expiry(d.expiresAt);
                      return (
                        <li key={d._id} className="flex items-center gap-3 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{d.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{DOCUMENT_LABEL[d.kind]}{d.number ? ` · ${d.number}` : ''}</p>
                          </div>
                          <Badge tone={e.tone}>{e.text}</Badge>
                          {!closed && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${d.label}`}
                              loading={removeDocument.isPending && removeDocument.variables === d._id}
                              onClick={async () => {
                                if ((await confirm({ title: `Remove ${d.label}?`, tone: 'destructive', confirmLabel: 'Remove' })).ok) removeDocument.mutate(d._id);
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
                      if (doc.label.trim().length < 2) return setDocError('Give it a name, like “Fleet policy 2026”.');
                      setDocError(null);
                      addDocument.mutate();
                    }}
                  >
                    <Field label="Type" htmlFor="doc-kind">
                      <Select id="doc-kind" value={doc.kind} onChange={(e) => setDoc((p) => ({ ...p, kind: e.target.value as DocumentKind }))}>
                        {Object.entries(DOCUMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </Select>
                    </Field>
                    <Field label="Name" htmlFor="doc-label" error={docError ?? undefined}><Input id="doc-label" value={doc.label} onChange={(e) => setDoc((p) => ({ ...p, label: e.target.value }))} placeholder="Fleet policy 2026" /></Field>
                    <Field label="Number" htmlFor="doc-number"><Input id="doc-number" value={doc.number} onChange={(e) => setDoc((p) => ({ ...p, number: e.target.value }))} /></Field>
                    <Field label="Expires" htmlFor="doc-exp"><Input id="doc-exp" type="date" value={doc.expiresAt} onChange={(e) => setDoc((p) => ({ ...p, expiresAt: e.target.value }))} /></Field>
                    <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="secondary" loading={addDocument.isPending}>Add document</Button></div>
                  </form>
                )}
              </CardContent>
            </Card>

            <DeliverySpotsCard hubId={hub._id} spots={hub.deliverySpots ?? []} readOnly={closed} />

            <Card>
              <CardHeader><CardTitle>Territory and share</CardTitle></CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <Detail label="Area"><span className="tabular-nums">{hub.territory.radiusMiles} mile radius</span>{hub.territory.exclusive ? ', exclusive' : ''}</Detail>
                  <Detail label="Centre"><span className="tabular-nums">{lat.toFixed(4)}, {lng.toFixed(4)}</span></Detail>
                  <Detail label="Time zone">{hub.timezone.replace('_', ' ')}</Detail>
                  <Detail label="Holder’s share of gross">
                    <span className="font-semibold tabular-nums">{bpsToPercent(hub.holderShareBps)}</span>
                    <span className="text-muted-foreground">{hub.economics?.holderShareBps === undefined ? ' (platform setting)' : ' (set for this hub)'}</span>
                  </Detail>
                </dl>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Licence holder login</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {issued ? (
                  <div className="space-y-3" role="status">
                    <p className="text-sm">Send these to <span className="font-medium">{hub.holder.contactName}</span>. They sign in on the hub portal.</p>
                    <dl className="space-y-2 rounded-lg bg-subtle p-3 font-mono text-sm">
                      <div><dt className="font-sans text-xs font-semibold text-muted-foreground">Username</dt><dd className="break-all">{issued.username}</dd></div>
                      {issued.password && <div><dt className="font-sans text-xs font-semibold text-muted-foreground">Password</dt><dd className="break-all">{issued.password}</dd></div>}
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
                  <p className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden /> Login created. The holder signs in on the hub portal.</p>
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
                    <Field label="Their name" htmlFor="op-name"><Input id="op-name" value={login.name} onChange={(e) => setLogin((p) => ({ ...p, name: e.target.value }))} placeholder={hub.holder.contactName} /></Field>
                    <Field label="Sign-in email" htmlFor="op-email"><Input id="op-email" type="email" value={login.email} onChange={(e) => setLogin((p) => ({ ...p, email: e.target.value }))} placeholder={hub.holder.email} /></Field>
                    <Button type="submit" className="w-full" loading={createLogin.isPending}><KeyRound className="h-4 w-4" aria-hidden /> Create login</Button>
                  </form>
                )}
                <dl className="space-y-2 border-t border-border pt-4 text-sm">
                  <Detail label="Company or name">{hub.holder.legalName}</Detail>
                  <Detail label="Contact">{hub.holder.contactName}</Detail>
                  <Detail label="Email"><a className="break-all text-primary hover:underline" href={`mailto:${hub.holder.email}`}>{hub.holder.email}</a></Detail>
                  {hub.holder.phone && <Detail label="Phone"><a className="text-primary hover:underline" href={`tel:${hub.holder.phone}`}>{hub.holder.phone}</a></Detail>}
                </dl>
              </CardContent>
            </Card>

            {hub.operatorUserId && <HubPayoutsCard hubId={hub._id} />}

            <Card>
              <CardHeader><CardTitle>History</CardTitle></CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {[...hub.timeline].reverse().map((t, i) => (
                    <li key={`${t.at}-${i}`} className="text-sm">
                      <p className="font-medium">{EVENT_LABEL[t.event] ?? t.event}</p>
                      {t.note && <p className="text-muted-foreground">{t.note}</p>}
                      <p className="text-xs text-muted-foreground">{formatDateTime(t.at)}{t.by === 'system' ? ' · automatic' : ''}</p>
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
