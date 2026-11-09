'use client';

import { PageHeader } from '@/components/ui/page-header';
import { AgreementEditor } from '@/features/asset-partners/agreement-editor';

export default function AdminPartnerAgreementPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Asset Partners"
        title="Agreement & NDA"
        description="One agreement and NDA for every city. Approved partners read and sign them in their portal, with their own details filled in. City operators can read them but not change them."
      />
      <AgreementEditor base="/admin" />
    </div>
  );
}
