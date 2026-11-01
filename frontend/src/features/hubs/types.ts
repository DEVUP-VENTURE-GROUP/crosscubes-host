export type HubStatus = 'setup' | 'live' | 'paused' | 'closed';
export type LicenceKind = 'franchise_agreement' | 'insurance' | 'state_permit' | 'business_licence' | 'sales_tax' | 'other';

export interface HubLicence {
  _id: string;
  kind: LicenceKind;
  label: string;
  number?: string;
  issuedAt?: string;
  expiresAt?: string;
  addedAt: string;
}

export interface Hub {
  _id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  status: HubStatus;
  territory: { center: { coordinates: [number, number] }; radiusMiles: number; exclusive: boolean };
  franchisee: { legalName: string; contactName: string; email: string; phone?: string };
  operatorUserId?: string;
  agreement: { signedAt?: string; startsAt?: string; termYears: number; endsAt?: string };
  economics: { royaltyPct: number; techFeePct: number; marketingFundPct: number };
  licences: HubLicence[];
  timeline: { at: string; by: string; event: string; note?: string }[];
  launchedAt?: string;
  createdAt: string;
}

export interface HubDetail extends Hub {
  launchBlockers: string[];
}

export interface HubInput {
  code: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  territory: { lng: number; lat: number; radiusMiles: number; exclusive: boolean };
  franchisee: { legalName: string; contactName: string; email: string; phone?: string };
  agreement: { signedAt?: string; startsAt?: string; termYears: number };
  economics: { royaltyPct: number; techFeePct: number; marketingFundPct: number };
}

export interface HubLicenceInput {
  kind: LicenceKind;
  label: string;
  number?: string;
  issuedAt?: string;
  expiresAt?: string;
}

export interface HubPerformance {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  status: HubStatus;
  trips: number;
  gmv: number;
  previousGmv: number;
  owedToHq: number;
  feePct: number;
  cars: number;
  listedCars: number;
  partners: number;
  blockers: number;
  licencesExpiringSoon: number;
}

export interface NetworkOverview {
  period: { from: string; to: string };
  totals: { hubs: number; live: number; trips: number; gmv: number; previousGmv: number; owedToHq: number; cars: number; listedCars: number };
  hubs: HubPerformance[];
  monthly: { month: string; byHub: Record<string, number> }[];
  unassigned: { trips: number; gmv: number };
}

export const HUB_STATUS_LABEL: Record<HubStatus, string> = { setup: 'Getting ready', live: 'Live', paused: 'Paused', closed: 'Closed' };
export const HUB_STATUS_TONE: Record<HubStatus, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  setup: 'default',
  live: 'success',
  paused: 'warning',
  closed: 'muted',
};

export const LICENCE_LABEL: Record<LicenceKind, string> = {
  franchise_agreement: 'Franchise agreement',
  insurance: 'Fleet insurance',
  state_permit: 'State rental permit',
  business_licence: 'Business licence',
  sales_tax: 'Sales tax registration',
  other: 'Other',
};

/** Growth against the previous period of the same length; null when there was nothing to compare with. */
export function growthPct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}
