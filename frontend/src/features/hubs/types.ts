export type HubStatus = 'setup' | 'live' | 'paused' | 'closed';
export type DocumentKind = 'insurance' | 'state_permit' | 'business_licence' | 'sales_tax' | 'other';

export interface HubDocument {
  _id: string;
  kind: DocumentKind;
  label: string;
  number?: string;
  issuedAt?: string;
  expiresAt?: string;
  addedAt: string;
}

export interface LicenceTerm {
  feeCents: number;
  paidAt: string;
  startsAt: string;
  expiresAt: string;
  reference?: string;
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
  holder: { legalName: string; contactName: string; email: string; phone?: string };
  operatorUserId?: string;
  economics: { holderShareBps?: number };
  licence: { startsAt?: string; expiresAt?: string; terms: LicenceTerm[] };
  documents: HubDocument[];
  timeline: { at: string; by: string; event: string; note?: string }[];
  launchedAt?: string;
  createdAt: string;
}

export interface HubDetail extends Hub {
  /** The share in force: this hub's own, else the platform's. */
  holderShareBps: number;
  launchBlockers: string[];
}

export interface HubInput {
  code: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  territory: { lng: number; lat: number; radiusMiles: number; exclusive: boolean };
  holder: { legalName: string; contactName: string; email: string; phone?: string };
  economics?: { holderShareBps?: number };
}

export interface HubDocumentInput {
  kind: DocumentKind;
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
  gross: number;
  previousGross: number;
  partnerShare: number;
  holderShare: number;
  hqShare: number;
  holderShareBps: number;
  cars: number;
  listedCars: number;
  partners: number;
  blockers: number;
  documentsExpiringSoon: number;
  licenceExpiresAt?: string;
}

export interface NetworkOverview {
  period: { from: string; to: string };
  totals: { hubs: number; live: number; trips: number; gross: number; previousGross: number; partnerShare: number; holderShare: number; hqShare: number; cars: number; listedCars: number };
  hubs: HubPerformance[];
  monthly: { month: string; byHub: Record<string, number> }[];
  unassigned: { trips: number; gross: number };
}

export const HUB_STATUS_LABEL: Record<HubStatus, string> = { setup: 'Getting ready', live: 'Live', paused: 'Paused', closed: 'Closed' };
export const HUB_STATUS_TONE: Record<HubStatus, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> = {
  setup: 'default',
  live: 'success',
  paused: 'warning',
  closed: 'muted',
};

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  insurance: 'Fleet insurance',
  state_permit: 'State rental permit',
  business_licence: 'Business licence',
  sales_tax: 'Sales tax registration',
  other: 'Other',
};

const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;
export { pct as bpsToPercent };

/** Growth against the previous period of the same length; null when there was nothing to compare with. */
export function growthPct(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}
