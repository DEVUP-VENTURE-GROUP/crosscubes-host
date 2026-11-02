import type { HubApplicationStatus } from '@/features/hubs/applications-api';

export const APPLICATION_TONE: Record<HubApplicationStatus, 'default' | 'success' | 'warning' | 'destructive' | 'muted'> = {
  submitted: 'default',
  approved: 'warning',
  paid: 'success',
  rejected: 'destructive',
  withdrawn: 'muted',
};
