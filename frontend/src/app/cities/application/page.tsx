'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock, ExternalLink, XCircle } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { PayNow } from '@/features/payments/pay-now';
import { APPLICATION_STATUS_LABEL, hubApplicationsApi, type MyHubApplication } from '@/features/hubs/applications-api';
import { IOC_SITE } from '@/lib/sites';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/utils/format';

const TONE: Record<MyHubApplication['status'], 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  submitted: 'default',
  approved: 'warning',
  paid: 'success',
  rejected: 'destructive',
  withdrawn: 'muted',
};

function Payment({ app }: { app: MyHubApplication }) {
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);
  const start = useMutation({ meta: { silentError: true }, mutationFn: () => hubApplicationsApi.pay(app.id) });

  // Card payments confirm instantly; the webhook is the backstop, so ask a few times before handing over to it.
  const confirmPaid = async () => {
    setChecking(true);
    for (let i = 0; i < 5; i++) {
      const r = await hubApplicationsApi.syncPayment(app.id).catch(() => ({ paid: false }));
      if (r.paid) break;
      await new Promise((res) => setTimeout(res, 1500));
    }
    setChecking(false);
    await qc.invalidateQueries({ queryKey: ['my-hub-application'] });
  };

  if (checking) return <p role="status" className="rounded-lg bg-subtle p-4 text-sm">Confirming your payment…</p>;
  if (start.data) return <PayNow clientSecret={start.data.clientSecret} returnPath="/cities/application?paid=1" onPaid={() => void confirmPaid()} />;
  return (
    <div className="space-y-3">
      {start.isError && <p role="alert" className="text-sm text-destructive">{start.error instanceof ApiError ? start.error.message : 'We couldn’t start the payment. Try again.'}</p>}
      <Button size="lg" className="w-full sm:w-auto" loading={start.isPending} onClick={() => start.mutate()}>
        Pay {app.licenceFeeCents !== undefined ? formatMoney({ amount: app.licenceFeeCents, currency: 'USD' }) : 'the licence'}
      </Button>
    </div>
  );
}

function Application() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const params = useSearchParams();
  const q = useQuery({ queryKey: ['my-hub-application'], queryFn: hubApplicationsApi.mine });
  const withdraw = useMutation({
    mutationFn: (id: string) => hubApplicationsApi.withdraw(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-hub-application'] }),
  });
  const app = q.data;

  // Back from a bank or pay-later page: check the payment instead of waiting for the webhook.
  useEffect(() => {
    if (params.get('paid') === '1' && app?.status === 'approved') {
      void hubApplicationsApi.syncPayment(app.id).then(() => qc.invalidateQueries({ queryKey: ['my-hub-application'] })).catch(() => undefined);
    }
  }, [params, app?.status, app?.id, qc]);

  if (q.isError) return <ErrorState message="We couldn’t load your application." retry={() => void q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-72 w-full rounded-lg" />;
  if (!app)
    return (
      <EmptyState
        title="No application yet"
        description="Apply to run the platform in your city. It takes about five minutes."
        action={<Link href="/cities#apply" className="inline-flex h-10 items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground">Apply for your city <ArrowRight className="h-4 w-4" aria-hidden /></Link>}
      />
    );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{app.city}, {app.state}</CardTitle>
          <p className="text-xs text-muted-foreground">Reference {app.reference} · sent {formatDate(app.submittedAt)}</p>
        </div>
        <Badge tone={TONE[app.status]}>{APPLICATION_STATUS_LABEL[app.status]}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        {app.status === 'submitted' && (
          <>
            <p className="flex items-start gap-3 text-sm"><Clock className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />Our team is reviewing your application and will call you. You don’t need to do anything yet.</p>
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              loading={withdraw.isPending}
              onClick={async () => {
                if ((await confirm({ title: 'Withdraw your application?', description: 'You can apply again later.', confirmLabel: 'Withdraw', tone: 'destructive' })).ok) withdraw.mutate(app.id);
              }}
            >
              Withdraw application
            </Button>
          </>
        )}

        {app.status === 'approved' && (
          <>
            <p className="flex items-start gap-3 text-sm"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />You’re approved to run {app.hub?.name ?? app.city}. Pay your city licence to open your hub portal.</p>
            {app.decisionNote && <p className="rounded-lg bg-subtle p-3 text-sm"><span className="font-semibold">From our team:</span> {app.decisionNote}</p>}
            <Payment app={app} />
          </>
        )}

        {app.status === 'paid' && (
          <>
            <p className="flex items-start gap-3 text-sm"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />Your licence is paid{app.hub?.licenceExpiresAt ? ` and runs to ${formatDate(app.hub.licenceExpiresAt)}` : ''}. Your hub portal is open.</p>
            <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
              <li>Sign in to the hub portal with this same account.</li>
              <li>Send HQ your fleet insurance and business licence.</li>
              <li>Start signing up local car owners as partners. HQ puts your city live once the checks are done.</li>
            </ol>
            <a href={IOC_SITE} className="inline-flex h-11 items-center gap-2 rounded-sm bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Open the hub portal <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </>
        )}

        {app.status === 'rejected' && (
          <>
            <p className="flex items-start gap-3 text-sm"><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />We can’t offer you this city right now.</p>
            <ul className="space-y-3">
              {(app.rejection ?? []).map((r) => (
                <li key={r.why} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{r.why}</p>
                  <p className="text-muted-foreground">{r.improve}</p>
                </li>
              ))}
            </ul>
            {app.decisionNote && <p className="rounded-lg bg-subtle p-3 text-sm"><span className="font-semibold">From our team:</span> {app.decisionNote}</p>}
            <Link href="/cities#apply" className="inline-flex text-sm font-semibold text-primary hover:underline">Apply again</Link>
          </>
        )}

        {app.status === 'withdrawn' && (
          <p className="text-sm">You withdrew this application. <Link href="/cities#apply" className="font-semibold text-primary hover:underline">Apply again</Link></p>
        )}
      </CardContent>
    </Card>
  );
}

export default function HubApplicationPage() {
  return (
    <AuthGuard>
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <h1 className="font-display text-2xl font-bold">Your city application</h1>
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
          <Application />
        </Suspense>
      </div>
    </AuthGuard>
  );
}
