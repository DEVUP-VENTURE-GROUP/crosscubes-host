'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { adminApi } from '@/features/admin/api';
import { adminPath } from '@/lib/admin-path';
import { HubForm } from '../../../features/hubs/hub-form';

export default function NewHubPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={adminPath('hubs')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Hub network
      </Link>
      <PageHeader eyebrow="Franchise" title="New hub" description="One city, one franchisee. The hub starts in ‘Getting ready’ and takes no bookings until its launch checklist is done." />
      <HubForm
        submitLabel="Create hub"
        onSubmit={async (input) => {
          const hub = await adminApi.createHub(input);
          await qc.invalidateQueries({ queryKey: ['hub-overview'] });
          toast({ tone: 'success', title: `${hub.name} created`, description: 'Next: create the franchisee’s login and add their licences.' });
          router.push(adminPath(`hubs/${hub._id}`));
        }}
      />
    </div>
  );
}
