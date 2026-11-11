export type InsuranceStatus = 'approved' | 'not_approved' | 'not_linked' | 'missing';

export const INSURANCE_LABEL: Record<InsuranceStatus, string> = {
  approved: 'Insured',
  not_approved: 'Not approved',
  not_linked: 'Not linked',
  missing: 'Missing from Wheelbase',
};

export const INSURANCE_TONE: Record<InsuranceStatus, 'success' | 'warning' | 'destructive' | 'muted'> = {
  approved: 'success',
  not_approved: 'destructive',
  not_linked: 'warning',
  missing: 'warning',
};

/** What the status means for a person running the car, in one sentence. */
export const INSURANCE_HELP: Record<InsuranceStatus, string> = {
  approved: 'Wheelbase has approved its insurance.',
  not_approved: 'Wheelbase hasn’t approved its insurance yet.',
  not_linked: 'Not linked to its Wheelbase listing yet.',
  missing: 'Its listing is no longer in the Wheelbase account.',
};
