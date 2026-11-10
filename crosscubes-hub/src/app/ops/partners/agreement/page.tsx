'use client';

import { PageHeader } from '@/components/ui/page-header';
import { AgreementEditor } from '@/features/asset-partners/agreement-editor';
import { PartnersNav } from '~/features/partners/partners-nav';

export default function PartnerAgreementPage() {
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Asset management" title="Agreement & NDA" description="What your partners sign. HQ writes these for every city; contact HQ if something needs to change." />
      <PartnersNav />
      <AgreementEditor base="/ioc" readOnly />
    </div>
  );
}
