'use client';

import { useState, type FormEvent } from 'react';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { mapsApi } from '@/features/maps/api';
import type { Hub, HubInput } from '@/features/hubs/types';
import { ApiError } from '@/lib/api/types';

const TIMEZONES = [
  ['America/New_York', 'Eastern'],
  ['America/Chicago', 'Central'],
  ['America/Denver', 'Mountain'],
  ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific'],
  ['America/Anchorage', 'Alaska'],
  ['Pacific/Honolulu', 'Hawaii'],
] as const;

interface Draft {
  code: string; name: string; city: string; state: string; timezone: string;
  lng: string; lat: string; radiusMiles: string; exclusive: boolean; place: string;
  legalName: string; contactName: string; email: string; phone: string;
  holderSharePct: string;
}

function draftFrom(h?: Hub): Draft {
  return {
    code: h?.code ?? '', name: h?.name ?? '', city: h?.city ?? '', state: h?.state ?? '', timezone: h?.timezone ?? 'America/Chicago',
    lng: h ? String(h.territory.center.coordinates[0]) : '', lat: h ? String(h.territory.center.coordinates[1]) : '',
    radiusMiles: h ? String(h.territory.radiusMiles) : '', exclusive: h?.territory.exclusive ?? true, place: '',
    legalName: h?.holder.legalName ?? '', contactName: h?.holder.contactName ?? '', email: h?.holder.email ?? '', phone: h?.holder.phone ?? '',
    holderSharePct: h?.economics?.holderShareBps !== undefined ? String(h.economics.holderShareBps / 100) : '',
  };
}

function toInput(d: Draft): HubInput {
  const share = d.holderSharePct.trim();
  return {
    code: d.code.trim().toUpperCase(), name: d.name.trim(), city: d.city.trim(), state: d.state.trim().toUpperCase(), timezone: d.timezone,
    territory: { lng: Number(d.lng), lat: Number(d.lat), radiusMiles: Number(d.radiusMiles), exclusive: d.exclusive },
    holder: { legalName: d.legalName.trim(), contactName: d.contactName.trim(), email: d.email.trim(), phone: d.phone.trim() || undefined },
    economics: { holderShareBps: share === '' ? undefined : Math.round(Number(share) * 100) },
  };
}

function check(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (!/^[A-Za-z]{2,6}$/.test(d.code.trim())) e.code = 'Use 2 to 6 letters, like HOU.';
  if (d.name.trim().length < 2) e.name = 'Give the hub a name.';
  if (d.city.trim().length < 2) e.city = 'Add the city.';
  if (!/^[A-Za-z]{2}$/.test(d.state.trim())) e.state = 'Two letters, like TX.';
  if (d.lat === '' || d.lng === '' || Number.isNaN(Number(d.lat)) || Number.isNaN(Number(d.lng))) e.place = 'Find the centre of the area first.';
  const r = Number(d.radiusMiles);
  if (!(r >= 1 && r <= 300)) e.radiusMiles = 'Between 1 and 300 miles.';
  if (d.legalName.trim().length < 2) e.legalName = 'The holder’s company or full name, as on the licence.';
  if (d.contactName.trim().length < 2) e.contactName = 'Who we deal with day to day.';
  if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) e.email = 'Enter a valid email.';
  const share = d.holderSharePct.trim();
  if (share !== '' && !(Number(share) >= 0 && Number(share) <= 50)) e.holderSharePct = 'A percent from 0 to 50, or leave it blank.';
  return e;
}

export function HubForm({ hub, defaultSharePct, submitLabel, onSubmit }: { hub?: Hub; defaultSharePct?: number; submitLabel: string; onSubmit: (input: HubInput) => Promise<unknown> }) {
  const [d, setD] = useState<Draft>(() => draftFrom(hub));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [found, setFound] = useState<string | null>(hub ? `${hub.city}, ${hub.state}` : null);
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  async function findCentre() {
    if (d.place.trim().length < 3) return setErrors((e) => ({ ...e, place: 'Type a city or address, like Houston, TX.' }));
    setFinding(true);
    try {
      const [hit] = await mapsApi.geocode(d.place.trim());
      if (!hit) return setErrors((e) => ({ ...e, place: 'We couldn’t find that place. Try the city and state.' }));
      setD((p) => ({ ...p, lat: hit.lat.toFixed(5), lng: hit.lng.toFixed(5), city: p.city || hit.city }));
      setFound(hit.formatted);
      setErrors((e) => ({ ...e, place: undefined }));
    } catch {
      setErrors((e) => ({ ...e, place: 'Search isn’t working right now. Try again in a moment.' }));
    } finally {
      setFinding(false);
    }
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = check(d);
    setErrors(e);
    if (Object.keys(e).length) return setFormError('Some details need fixing. They’re marked below.');
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit(toInput(d));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'We couldn’t save the hub. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {formError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{formError}</p>}

      <Card>
        <CardHeader><CardTitle>City</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Hub name" htmlFor="name" error={errors.name} required><Input id="name" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Houston" /></Field>
          <Field label="Short code" htmlFor="code" error={errors.code} hint="Shown on every screen, like HOU." required><Input id="code" value={d.code} onChange={(e) => set('code', e.target.value.toUpperCase())} maxLength={6} className="font-mono uppercase" /></Field>
          <Field label="City" htmlFor="city" error={errors.city} required><Input id="city" value={d.city} onChange={(e) => set('city', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="State" htmlFor="state" error={errors.state} required><Input id="state" value={d.state} onChange={(e) => set('state', e.target.value.toUpperCase())} maxLength={2} className="uppercase" /></Field>
            <Field label="Time zone" htmlFor="tz" required>
              <Select id="tz" value={d.timezone} onChange={(e) => set('timezone', e.target.value)}>
                {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Territory</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Centre of the area" htmlFor="place" error={errors.place} hint={found && !errors.place ? `Centre set: ${found}` : 'Every car parked within the radius belongs to this hub.'} required>
            <div className="flex gap-2">
              <Input id="place" value={d.place} onChange={(e) => set('place', e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void findCentre(); } }} placeholder="Houston, TX" />
              <Button type="button" variant="outline" onClick={() => void findCentre()} loading={finding}><MapPin className="h-4 w-4" aria-hidden /> Find</Button>
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Radius in miles" htmlFor="radius" error={errors.radiusMiles} required><Input id="radius" inputMode="decimal" value={d.radiusMiles} onChange={(e) => set('radiusMiles', e.target.value)} className="tabular-nums" /></Field>
            <label className="flex items-start gap-3 rounded-sm border border-border p-3 text-sm sm:mt-6">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={d.exclusive} onChange={(e) => set('exclusive', e.target.checked)} />
              <span><span className="font-medium">Exclusive territory</span><span className="block text-xs text-muted-foreground">No other hub may overlap this area.</span></span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Licence holder</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Company or full name" htmlFor="legal" error={errors.legalName} required><Input id="legal" value={d.legalName} onChange={(e) => set('legalName', e.target.value)} placeholder="Bayou Mobility LLC" /></Field>
          <Field label="Main contact" htmlFor="contact" error={errors.contactName} required><Input id="contact" value={d.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
          <Field label="Email" htmlFor="email" error={errors.email} required><Input id="email" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone" htmlFor="phone"><Input id="phone" type="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field
            label="Holder’s share of gross %"
            htmlFor="share"
            error={errors.holderSharePct}
            hint={`Leave blank to use the platform setting${defaultSharePct !== undefined ? ` (${defaultSharePct}%)` : ''}. It comes out of HQ’s management fee.`}
            className="sm:col-span-2"
          >
            <Input id="share" inputMode="decimal" value={d.holderSharePct} onChange={(e) => set('holderSharePct', e.target.value)} className="max-w-32 tabular-nums" />
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={saving}>{submitLabel}</Button>
      </div>
    </form>
  );
}
