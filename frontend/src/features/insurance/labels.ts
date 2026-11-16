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

export type ReservationState = 'active' | 'completed' | 'cancelled';

export const RESERVATION_LABEL: Record<ReservationState, string> = {
  active: 'Booked',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const RESERVATION_TONE: Record<ReservationState, 'success' | 'muted' | 'warning'> = {
  active: 'success',
  completed: 'muted',
  cancelled: 'warning',
};

export const reservationAmount = (cents: number | undefined, currency: string) =>
  cents === undefined ? '–' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: currency || 'USD' });

export const reservationDates = (start: string, end: string) => {
  const f = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return `${f(start)} – ${f(end)}`;
};
