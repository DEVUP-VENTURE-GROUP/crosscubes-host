'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const settings = useQuery({ queryKey: ['admin-config'], queryFn: () => adminApi.config(), staleTime: 5 * 60_000 });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={adminPath('hubs')} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Hub network
      </Link>
      <PageHeader eyebrow="Cities" title="New hub" description="One city, one licence holder. The hub starts in ‘Getting ready’ and takes no bookings until the licence is paid and the launch checklist is done." />
      <HubForm
        submitLabel="Create hub"
        defaultSharePct={settings.data?.hubs ? settings.data.hubs.holderShareBps / 100 : undefined}
        onSubmit={async (input) => {
          const hub = await adminApi.createHub(input);
          await qc.invalidateQueries({ queryKey: ['hub-overview'] });
          toast({ tone: 'success', title: `${hub.name} created`, description: 'Next: record the licence payment, create the holder’s login and add their insurance.' });
          router.push(adminPath(`hubs/${hub._id}`));
        }}
      />
    </div>
  );
}
