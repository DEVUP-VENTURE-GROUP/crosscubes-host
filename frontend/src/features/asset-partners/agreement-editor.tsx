'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, FileSignature } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi, type AgreementKind } from '@/features/asset-partners/manage-api';
import { STANDARD_AGREEMENT } from '@/features/asset-partners/agreement-template';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';

const DEFAULT_TITLE: Record<AgreementKind, string> = { agreement: 'CrossCubes Asset Partner Agreement', nda: 'CrossCubes Non-Disclosure Agreement', amendment: 'Amendment to the Asset Partner Agreement' };
const KIND_LABEL: Record<AgreementKind, string> = { agreement: 'Asset Partner Agreement', nda: 'NDA', amendment: 'Rate change (optional)' };

/** The partner agreement, NDA and rate-change text: HQ edits and publishes, a city operator only reads. */
export function AgreementEditor({ base, readOnly = false }: { base: '/admin' | '/ioc'; readOnly?: boolean }) {
  const manage = partnerManageApi(base);
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState<AgreementKind>('agreement');
  const key = ['partner-agreements', base];
  const q = useQuery({ queryKey: key, queryFn: () => manage.agreements() });
  const placeholders = useQuery({ queryKey: ['agreement-placeholders', base], queryFn: () => manage.placeholders(), staleTime: Infinity, enabled: !readOnly });
  const versions = (q.data ?? []).filter((v) => (v.kind ?? 'agreement') === kind);
  const current = versions[0];
  const published = {
    agreement: (q.data ?? []).some((v) => (v.kind ?? 'agreement') === 'agreement'),
    nda: (q.data ?? []).some((v) => v.kind === 'nda'),
    amendment: (q.data ?? []).some((v) => v.kind === 'amendment'),
  };
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(current?.title ?? DEFAULT_TITLE[kind]);
    setBody(current?.body ?? '');
  }, [current, kind]);

  const publish = useMutation({
    meta: { silentError: true },
    mutationFn: () => manage.publishAgreement({ kind, title: title.trim(), body: body.trim() }),
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: ['partner-agreements'] });
      toast({ tone: 'success', title: `Version ${v.version} published`, description: 'Newly approved partners in every city sign this version.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not publish' }),
  });

  const insert = (token: string) => {
    const text = `{{${token}}}`;
    const el = bodyRef.current;
    if (el) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      setBody(body.slice(0, start) + text + body.slice(end));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); });
    } else {
      void navigator.clipboard?.writeText(text);
    }
    setCopied(token);
    setTimeout(() => setCopied(''), 1200);
  };

  const changed = !!body.trim() && (body.trim() !== (current?.body ?? '') || title.trim() !== (current?.title ?? ''));
  const send = async () => {
    if (/\[BEFORE PUBLISHING|\[CrossCubes legal notice address\]|\[CROSSCUBES LEGAL ENTITY NAME\]/.test(body)) {
      toast({ tone: 'error', title: 'Finish the text first', description: 'Remove the “BEFORE PUBLISHING” line and fill in the company name and legal notice address.' });
      return;
    }
    const { ok } = await confirm({
      title: `Publish this ${kind === 'nda' ? 'NDA' : 'agreement'}?`,
      description: 'It applies in every city. Partners who already signed keep the version they signed; everyone approved from now on signs this one.',
      confirmLabel: 'Publish',
    });
    if (ok) publish.mutate();
  };

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (q.isError) return <ErrorState message="We couldn’t load the documents." retry={() => q.refetch()} />;

  const versionList = (
    <Card>
      <CardHeader><CardTitle className="text-base">Versions</CardTitle></CardHeader>
      <CardContent className="p-0">
        {!versions.length ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">None published yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {versions.map((v) => (
              <li key={v._id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-medium tabular-nums">Version {v.version}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDate(v.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-5">
      {(!published.agreement || !published.nda) && (
        <p className="rounded-lg bg-warning/10 p-3 text-sm">
          {readOnly
            ? 'HQ hasn’t published both documents yet. Until it does, approved partners see “Your documents are being prepared”.'
            : 'Publish both the agreement and the NDA. Until both are live, approved partners in every city see “Your documents are being prepared”.'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {(['agreement', 'nda', 'amendment'] as const).map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(k)}>
            {published[k] && <Check className="me-1 h-3.5 w-3.5" />}
            {KIND_LABEL[k]}
          </Chip>
        ))}
      </div>

      {readOnly ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_20rem]">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {current ? current.title : KIND_LABEL[kind]}
                {current && <Badge tone="success">Live: version {current.version}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {current ? (
                <pre className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-subtle p-4 font-sans text-sm leading-relaxed">{current.body}</pre>
              ) : (
                <EmptyState icon={<FileSignature className="h-8 w-8" />} title="Not published yet" description="HQ writes and publishes this document for every city." />
              )}
            </CardContent>
          </Card>
          {versionList}
        </div>
      ) : (
        <>
          {kind === 'amendment' && (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              The text a partner signs when their rate changes after they have signed. If you never publish one, a standard text is used. Use {'{{changes_table}}'} where the list of old and new terms should go and {'{{changes_effective}}'} for the start date.
            </p>
          )}
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_20rem]">
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {current ? 'Edit and publish a new version' : 'Publish the first version'}
                  {current && <Badge tone="success">Live: version {current.version}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {kind === 'agreement' && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-subtle p-3 text-sm">
                    <span>Start from the standard agreement, with every exhibit and the live terms as placeholders. Change anything, then publish.</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        if (body.trim() && !(await confirm({ title: 'Replace the text in the editor?', description: 'Nothing is published until you press Publish.', confirmLabel: 'Replace' })).ok) return;
                        setTitle(STANDARD_AGREEMENT.title);
                        setBody(STANDARD_AGREEMENT.body);
                      }}
                    >
                      Use the standard agreement
                    </Button>
                  </div>
                )}
                <Field label="Title" htmlFor="title"><Input id="title" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <Field label="Text" htmlFor="body" hint="Paste the full text. Line breaks are kept. Put the partner’s details where they belong with the placeholders on the right.">
                  <Textarea id="body" ref={bodyRef} rows={20} className="font-mono text-xs leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>
                <div className="flex justify-end">
                  <Button className="w-full sm:w-auto" disabled={!changed || title.trim().length < 3 || body.trim().length < 50} loading={publish.isPending} onClick={() => void send()}>
                    <FileSignature className="h-4 w-4" /> Publish
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader><CardTitle className="text-base">Partner details</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  <p className="pb-1 text-xs text-muted-foreground">Click to insert at the cursor. Filled in for each partner when they sign.</p>
                  {(placeholders.data ?? []).map((p) => (
                    <button key={p.key} type="button" onClick={() => insert(p.key)} className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0 truncate">{p.label}</span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-muted-foreground">
                        {copied === p.key ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                        {`{{${p.key}}}`}
                      </span>
                    </button>
                  ))}
                </CardContent>
              </Card>
              {versionList}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
