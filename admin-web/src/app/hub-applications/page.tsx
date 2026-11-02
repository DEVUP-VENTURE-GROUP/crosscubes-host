'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';
import { APPLICATION_STATUS_LABEL, START_LABEL, type HubApplicationRow, type HubApplicationStatus } from '@/features/hubs/applications-api';
import { formatDate } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';
import { APPLICATION_TONE } from '../../features/hubs/labels';

const FILTERS: (HubApplicationStatus | '')[] = ['submitted', 'approved', 'paid', 'rejected', 'withdrawn', ''];

export default function HubApplicationsPage() {
  const [status, setStatus] = useState<HubApplicationStatus | ''>('submitted');
  const q = useQuery({ queryKey: ['hub-applications', status], queryFn: () => adminApi.hubApplications(status || undefined) });

  const columns: Column<HubApplicationRow>[] = [
    {
      header: 'Applicant',
      cell: (a) => (
        <Link href={adminPath(`hub-applications/${a._id}`)} className="block min-w-0 rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="block truncate font-semibold">{a.applicant.fullName}</span>
          <span className="block truncate text-xs text-muted-foreground">{a.applicant.companyName || a.applicant.email}</span>
        </Link>
      ),
    },
    { header: 'City', cell: (a) => <span className="text-sm">{a.applicant.city}, {a.applicant.state}</span> },
    { header: 'Cars, year 1', numeric: true, sortValue: (a) => a.applicant.carsFirstYear, cell: (a) => <span className="tabular-nums">{a.applicant.carsFirstYear}</span>, hideOnMobile: true },
    { header: 'Start', cell: (a) => <span className="text-xs">{START_LABEL[a.applicant.startTimeline]}</span>, hideOnMobile: true },
    { header: 'Sent', sortValue: (a) => a.createdAt, cell: (a) => <span className="text-xs">{formatDate(a.createdAt)}</span>, hideOnMobile: true },
    { header: 'Status', cell: (a) => <Badge tone={APPLICATION_TONE[a.status]}>{APPLICATION_STATUS_LABEL[a.status]}</Badge> },
  ];

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Cities" title="City applications" description="People who want a city licence. Approve to set up their hub and ask for the licence payment, or decline with reasons they can act on." />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Status">
        {FILTERS.map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)}>{s ? APPLICATION_STATUS_LABEL[s] : 'All'}</Chip>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={q.data?.map((a) => a)}
        isLoading={q.isLoading}
        isError={q.isError}
        onRetry={() => void q.refetch()}
        errorMessage="We couldn’t load city applications."
        emptyTitle={status ? 'Nothing here' : 'No applications yet'}
        emptyDescription={status ? 'Try another filter.' : 'Applications from the “Run the platform in your city” page appear here.'}
      />
    </div>
  );
}
