import { api } from '@/lib/api/client';

export type StartTimeline = 'now' | 'three_months' | 'six_months';
export type HubApplicationStatus = 'submitted' | 'approved' | 'rejected' | 'paid' | 'withdrawn';
export type HubRejectionReason = 'territory_taken' | 'market_not_ready' | 'experience' | 'capital' | 'incomplete' | 'other';

export interface LicenceTerms {
  licenceFeeCents: number;
  termMonths: number;
  holderShareBps: number;
  partnerShareBps: number;
  currency: string;
}

export interface HubApplyInput {
  fullName: string;
  phone: string;
  companyName?: string;
  city: string;
  state: string;
  about: string;
  carsFirstYear: number;
  startTimeline: StartTimeline;
  hasBusinessEntity: boolean;
}

export interface MyHubApplication {
  id: string;
  reference: string;
  status: HubApplicationStatus;
  city: string;
  state: string;
  submittedAt: string;
  licenceFeeCents?: number;
  paidAt?: string;
  decisionNote?: string;
  rejection?: { why: string; improve: string }[];
  hub: { code: string; name: string; status: string; licenceExpiresAt?: string } | null;
}

export interface HubApplicationRow {
  _id: string;
  reference: string;
  userId: string;
  status: HubApplicationStatus;
  applicant: HubApplyInput & { email: string };
  decision?: { by: string; at: string; note?: string; reasons?: HubRejectionReason[] };
  hubId?: string;
  licenceFeeCents?: number;
  payment?: { paidAt?: string };
  timeline: { at: string; by: string; event: string; note?: string }[];
  createdAt: string;
}

export const START_LABEL: Record<StartTimeline, string> = { now: 'Straight away', three_months: 'Within 3 months', six_months: 'Within 6 months' };
export const APPLICATION_STATUS_LABEL: Record<HubApplicationStatus, string> = {
  submitted: 'In review',
  approved: 'Approved, licence to pay',
  rejected: 'Declined',
  paid: 'Licence paid',
  withdrawn: 'Withdrawn',
};

export const hubApplicationsApi = {
  terms: () => api.get<LicenceTerms>('/hubs/licence-terms', undefined, false),
  apply: (body: HubApplyInput) => api.post<HubApplicationRow>('/hub-applications', body),
  mine: () => api.get<MyHubApplication | null>('/hub-applications/mine'),
  pay: (id: string) => api.post<{ clientSecret: string; amountCents: number }>(`/hub-applications/${id}/pay`),
  syncPayment: (id: string) => api.post<{ paid: boolean }>(`/hub-applications/${id}/payment-sync`),
  withdraw: (id: string) => api.post<{ withdrawn: true }>(`/hub-applications/${id}/withdraw`),
};
