'use client';

import { Clock, Gift, Car, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { toDollars, toCents, toPct, toBps } from './shared';
import type { TabProps } from './shared';

export function PayoutsTab({ draft, set }: TabProps) {
  return (
    <>
        <>
      {/* Payouts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" /> Host payouts</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Hold window (hours)" hint="Protects against disputes/chargebacks.">
            <Input type="number" min={0} value={draft.payout.holdHours}
              onChange={(e) => set((d) => { d.payout.holdHours = Number(e.target.value); })} />
          </Field>
          <Field label="Instant payout fee %">
            <Input type="number" step="0.1" value={toPct(draft.payout.instantFeeBps)}
              onChange={(e) => set((d) => { d.payout.instantFeeBps = toBps(e.target.value); })} />
          </Field>
          <Field label="Minimum fee ($)">
            <Input type="number" step="0.01" value={toDollars(draft.payout.instantFeeMinCents)}
              onChange={(e) => set((d) => { d.payout.instantFeeMinCents = toCents(e.target.value); })} />
          </Field>
        </CardContent>
      </Card>
        </>
        <>
      {/* Growth levers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Gift className="h-5 w-5 text-primary" /> Rewards</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Point value ($)" hint="Redemption value of 1 point.">
              <Input type="number" step="0.01" value={toDollars(draft.rewards.pointValueCents)}
                onChange={(e) => set((d) => { d.rewards.pointValueCents = toCents(e.target.value); })} />
            </Field>
            <Field label="Points per $1 earned">
              <Input type="number" min={0} value={draft.rewards.pointsPerDollar}
                onChange={(e) => set((d) => { d.rewards.pointsPerDollar = Number(e.target.value); })} />
            </Field>
          </CardContent>
        </Card>

      </div>
      {draft.hubs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" /> City licences</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Field label="Licence price ($)" hint="What a new or renewing licence holder pays.">
              <Input type="number" min={0} value={toDollars(draft.hubs.licenceFeeCents)}
                onChange={(e) => set((d) => { d.hubs!.licenceFeeCents = toCents(e.target.value); })} />
            </Field>
            <Field label="Licence length (months)">
              <Input type="number" min={1} max={60} value={draft.hubs.licenceTermMonths}
                onChange={(e) => set((d) => { d.hubs!.licenceTermMonths = Number(e.target.value); })} />
            </Field>
            <Field label="Holder share of each trip %" hint="Taken from the management fee. A hub can override it.">
              <Input type="number" step="0.5" min={0} max={50} value={toPct(draft.hubs.holderShareBps)}
                onChange={(e) => set((d) => { d.hubs!.holderShareBps = toBps(e.target.value); })} />
            </Field>
            <Field label="Renewal reminder (days before)">
              <Input type="number" min={1} max={120} value={draft.hubs.licenceReminderDays}
                onChange={(e) => set((d) => { d.hubs!.licenceReminderDays = Number(e.target.value); })} />
            </Field>
            <Field label="Holder payout day" hint="Day of the month last month’s statements are written.">
              <Input type="number" min={1} max={28} value={draft.hubs.payoutDayOfMonth}
                onChange={(e) => set((d) => { d.hubs!.payoutDayOfMonth = Number(e.target.value); })} />
            </Field>
          </CardContent>
        </Card>
      )}
        </>
    </>
  );
}
