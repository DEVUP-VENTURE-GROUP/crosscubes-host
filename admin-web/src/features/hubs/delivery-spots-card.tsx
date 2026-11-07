'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { adminApi } from '@/features/admin/api';
import { mapsApi } from '@/features/maps/api';
import type { DeliverySpot } from '@/features/hubs/types';
import { ApiError } from '@/lib/api/types';
import { formatMoney } from '@/lib/utils/format';

const KIND_LABEL: Record<DeliverySpot['kind'], string> = { airport: 'Airport', hotel: 'Hotel', business: 'Business or station' };
const ACCESS_LABEL: Record<DeliverySpot['accessMethod'], string> = { in_person: 'Handed over in person', lockbox: 'Lockbox', remote_unlock: 'Unlocked remotely' };

/** The hub's standard priced delivery places; every new car listed in the hub starts with them. */
export function DeliverySpotsCard({ hubId, spots, readOnly }: { hubId: string; spots: DeliverySpot[]; readOnly?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState({ kind: 'airport' as DeliverySpot['kind'], place: '', fee: '', minTripDays: '0', accessMethod: 'in_person' as DeliverySpot['accessMethod'] });
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: DeliverySpot[]) => adminApi.setHubDeliverySpots(hubId, next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hub', hubId] });
      toast({ tone: 'success', title: 'Delivery spots saved', description: 'New cars in this hub start with them.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'We couldn’t save the delivery spots.' }),
  });

  async function add() {
    const fee = Number(draft.fee);
    if (draft.place.trim().length < 3) return setError('Type the place, like “George Bush Intercontinental Airport”.');
    if (!(fee >= 0 && fee <= 1000) || draft.fee.trim() === '') return setError('Enter the delivery fee in dollars, like 55.');
    setFinding(true);
    try {
      const [hit] = await mapsApi.geocode(draft.place.trim());
      if (!hit) return setError('We couldn’t find that place. Add the city and state.');
      setError(null);
      save.mutate([
        ...spots,
        { kind: draft.kind, name: draft.place.trim(), address: hit.formatted, lat: hit.lat, lng: hit.lng, fee: Math.round(fee * 100), minTripDays: Number(draft.minTripDays) || 0, accessMethod: draft.accessMethod },
      ]);
      setDraft((d) => ({ ...d, place: '', fee: '' }));
    } catch {
      setError('Place search isn’t working right now. Try again in a moment.');
    } finally {
      setFinding(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Delivery spots</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {spots.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. Add the airports and hotels this city delivers to, each with its fee. New cars in the hub start with them; hosts can change them per car.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {spots.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex items-center gap-3 p-3 text-sm">
                <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{KIND_LABEL[s.kind]} · {ACCESS_LABEL[s.accessMethod]}{s.minTripDays ? ` · ${s.minTripDays}+ day trips` : ''}</span>
                </span>
                <span className="font-medium tabular-nums">{formatMoney({ amount: s.fee, currency: 'USD' })}</span>
                {!readOnly && (
                  <Button variant="ghost" size="icon" aria-label={`Remove ${s.name}`} disabled={save.isPending} onClick={() => save.mutate(spots.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!readOnly && spots.length < 15 && (
          <div className="grid gap-3 rounded-lg bg-subtle p-4 sm:grid-cols-2">
            <Field label="Type" htmlFor="ds-kind"><Select id="ds-kind" value={draft.kind} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as DeliverySpot['kind'] }))}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Field label="Place" htmlFor="ds-place" error={error ?? undefined}><Input id="ds-place" value={draft.place} onChange={(e) => setDraft((d) => ({ ...d, place: e.target.value }))} /></Field>
            <Field label="Fee ($)" htmlFor="ds-fee"><Input id="ds-fee" inputMode="decimal" value={draft.fee} onChange={(e) => setDraft((d) => ({ ...d, fee: e.target.value }))} className="tabular-nums" /></Field>
            <Field label="Shortest trip (days)" htmlFor="ds-min"><Input id="ds-min" inputMode="numeric" value={draft.minTripDays} onChange={(e) => setDraft((d) => ({ ...d, minTripDays: e.target.value }))} className="tabular-nums" /></Field>
            <Field label="Handover" htmlFor="ds-access" className="sm:col-span-2"><Select id="ds-access" value={draft.accessMethod} onChange={(e) => setDraft((d) => ({ ...d, accessMethod: e.target.value as DeliverySpot['accessMethod'] }))}>{Object.entries(ACCESS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <div className="flex justify-end sm:col-span-2"><Button variant="secondary" loading={finding || save.isPending} onClick={() => void add()}>Add spot</Button></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
