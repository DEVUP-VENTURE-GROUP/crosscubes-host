'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { adminApi } from '@/features/admin/api';
import { PAYOUT_METHOD_LABEL, type HubPayout, type HubPayoutMethod } from '@/features/hubs/types';
import { ApiError } from '@/lib/api/types';
import { formatDate, formatMoney } from '@/lib/utils/format';

const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = (period: string) => MONTH.format(new Date(`${period}-01T00:00:00Z`));

function PayRow({ payout, onPaid }: { payout: HubPayout; onPaid: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [method, setMethod] = useState<HubPayoutMethod>('bank_transfer');
  const [reference, setReference] = useState('');
  const pay = useMutation({
    mutationFn: () => adminApi.markHubPayoutPaid(payout._id, { method, reference: reference.trim() || undefined }),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Marked paid', description: 'The licence holder has been told.' });
      onPaid();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'We couldn’t mark it paid.' }),
  });
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select aria-label="How it was paid" value={method} onChange={(e) => setMethod(e.target.value as HubPayoutMethod)} className="sm:w-40">
        {Object.entries(PAYOUT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </Select>
      <Input aria-label="Reference" placeholder="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      <Button
        variant="secondary"
        loading={pay.isPending}
        onClick={async () => {
          if ((await confirm({ title: `Mark ${usd(payout.amountCents)} paid?`, description: 'Only do this once the money has actually been sent.', confirmLabel: 'Mark paid' })).ok) pay.mutate();
        }}
      >
        Mark paid
      </Button>
    </div>
  );
}

/** The holder's monthly statements for one hub, with the controls finance uses to record a payment. */
export function HubPayoutsCard({ hubId }: { hubId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hub-payouts', hubId], queryFn: () => adminApi.hubPayouts(hubId) });
  return (
    <Card>
      <CardHeader><CardTitle>Licence holder payouts</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : q.isError ? (
          <ErrorState message="We couldn’t load the payouts." retry={() => void q.refetch()} />
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">No statements yet. Each month’s statement is written on the payout day set in Platform Economics.</p>
        ) : (
          <ul className="space-y-3">
            {q.data.map((p) => (
              <li key={p._id} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{monthName(p.period)}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">{p.trips} trips · {usd(p.grossCents)} gross · {p.holderShareBps / 100}%</p>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold tabular-nums">{usd(p.amountCents)}</p>
                    <Badge tone={p.status === 'paid' ? 'success' : 'warning'}>{p.status === 'paid' ? 'Paid' : 'To pay'}</Badge>
                  </div>
                </div>
                {p.status === 'pending' ? (
                  <PayRow payout={p} onPaid={() => void qc.invalidateQueries({ queryKey: ['hub-payouts', hubId] })} />
                ) : p.paid ? (
                  <p className="text-xs text-muted-foreground">{PAYOUT_METHOD_LABEL[p.paid.method]} on {formatDate(p.paid.at)}{p.paid.reference ? ` · ${p.paid.reference}` : ''}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
