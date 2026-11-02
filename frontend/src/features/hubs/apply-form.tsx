'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { hubApplicationsApi, START_LABEL, type StartTimeline } from '@/features/hubs/applications-api';
import { US_STATES } from '@/lib/data/us-states';
import { ApiError } from '@/lib/api/types';

interface Draft {
  fullName: string; phone: string; companyName: string; city: string; state: string;
  about: string; carsFirstYear: string; startTimeline: StartTimeline | ''; hasBusinessEntity: 'yes' | 'no' | '';
}

const BLANK: Draft = { fullName: '', phone: '', companyName: '', city: '', state: 'TX', about: '', carsFirstYear: '', startTimeline: '', hasBusinessEntity: '' };

function check(d: Draft): Partial<Record<keyof Draft, string>> {
  const e: Partial<Record<keyof Draft, string>> = {};
  if (d.fullName.trim().length < 2) e.fullName = 'Your full legal name.';
  if (d.phone.replace(/\D/g, '').length < 10) e.phone = 'A number we can call you on.';
  if (d.city.trim().length < 2) e.city = 'The city you want to run.';
  if (!d.state) e.state = 'Pick the state.';
  if (d.about.trim().length < 40) e.about = 'A few sentences, at least: your background and why this city.';
  const cars = Number(d.carsFirstYear);
  if (!(Number.isInteger(cars) && cars >= 1 && cars <= 2000)) e.carsFirstYear = 'A whole number, like 20.';
  if (!d.startTimeline) e.startTimeline = 'Pick one.';
  if (!d.hasBusinessEntity) e.hasBusinessEntity = 'Pick one.';
  return e;
}

export function HubApplyForm({ defaultName }: { defaultName?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>({ ...BLANK, fullName: defaultName ?? '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const apply = useMutation({
    meta: { silentError: true },
    mutationFn: () =>
      hubApplicationsApi.apply({
        fullName: d.fullName.trim(),
        phone: d.phone,
        companyName: d.companyName.trim() || undefined,
        city: d.city.trim(),
        state: d.state,
        about: d.about.trim(),
        carsFirstYear: Number(d.carsFirstYear),
        startTimeline: d.startTimeline as StartTimeline,
        hasBusinessEntity: d.hasBusinessEntity === 'yes',
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['my-hub-application'] });
      router.push('/cities/application');
    },
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = check(d);
    setErrors(e);
    if (Object.keys(e).length === 0) apply.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {apply.isError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {apply.error instanceof ApiError ? apply.error.message : 'We couldn’t send your application. Try again in a moment.'}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full legal name" htmlFor="fullName" error={errors.fullName} required><Input id="fullName" autoComplete="name" value={d.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
        <Field label="Mobile number" htmlFor="phone" error={errors.phone} required><PhoneInput id="phone" value={d.phone} onChange={(v) => set('phone', v)} /></Field>
      </div>
      <Field label="Company name" htmlFor="company" hint="If you’ll run the city through a company."><Input id="company" autoComplete="organization" value={d.companyName} onChange={(e) => set('companyName', e.target.value)} /></Field>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="City you want to run" htmlFor="city" error={errors.city} required><Input id="city" autoComplete="address-level2" value={d.city} onChange={(e) => set('city', e.target.value)} placeholder="Houston" /></Field>
        <Field label="State" htmlFor="state" error={errors.state} required>
          <Select id="state" value={d.state} onChange={(e) => set('state', e.target.value)}>{US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        </Field>
      </div>
      <Field label="About you" htmlFor="about" error={errors.about} hint="Your work so far (cars, rentals, operations, sales) and why you know this city." required>
        <Textarea id="about" rows={5} value={d.about} onChange={(e) => set('about', e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Cars in your first year" htmlFor="cars" error={errors.carsFirstYear} required><Input id="cars" inputMode="numeric" value={d.carsFirstYear} onChange={(e) => set('carsFirstYear', e.target.value)} className="tabular-nums" /></Field>
        <Field label="When could you start?" htmlFor="start" error={errors.startTimeline} required>
          <Select id="start" value={d.startTimeline} onChange={(e) => set('startTimeline', e.target.value as StartTimeline)}>
            <option value="">Choose</option>
            {Object.entries(START_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Do you have a registered business?" htmlFor="entity" error={errors.hasBusinessEntity} required>
          <Select id="entity" value={d.hasBusinessEntity} onChange={(e) => set('hasBusinessEntity', e.target.value as 'yes' | 'no')}>
            <option value="">Choose</option>
            <option value="yes">Yes</option>
            <option value="no">Not yet</option>
          </Select>
        </Field>
      </div>
      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Nothing is charged now. You pay the licence only if we approve you.</p>
        <Button type="submit" size="lg" loading={apply.isPending}>Send application</Button>
      </div>
    </form>
  );
}
