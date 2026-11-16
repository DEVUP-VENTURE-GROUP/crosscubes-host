import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { DeliverySpot, DocumentKind, HubPayout, HubStatus } from '@/features/hubs/types';
import type { InsuranceStatus } from '@/features/insurance/labels';

export interface MyHub {
  code: string;
  name: string;
  city: string;
  state: string;
  status: HubStatus;
  launchedAt?: string;
  holderShareBps: number;
  licenceExpiresAt?: string;
  documents: { id: string; kind: DocumentKind; label: string; expiresAt?: string }[];
  launchBlockers: string[];
  deliverySpots: DeliverySpot[];
}

export const useMyHub = () => useQuery({ queryKey: ['my-hub'], queryFn: () => api.get<MyHub>('/ioc/hub') });
export const useMyHubPayouts = () => useQuery({ queryKey: ['my-hub-payouts'], queryFn: () => api.get<HubPayout[]>('/ioc/hub/payouts') });

export interface MyHubInsurance {
  requireApproved: boolean;
  checkedAt: string | null;
  cars: { id: string; name: string; plate?: string; status: string; photoUrl?: string; insurance: InsuranceStatus; bookable: boolean; planLabel?: string; minRenterAge?: number }[];
}

export interface MyHubWheelbaseBooking {
  _id: string;
  rentalId: number;
  vehicleId?: string;
  status: string;
  state: 'active' | 'completed' | 'cancelled';
  period: { start: string; end: string };
  amountCents?: number;
  currency: string;
  renterName?: string;
}

export const useMyHubWheelbaseBookings = () =>
  useQuery({ queryKey: ['my-hub-wheelbase-bookings'], queryFn: () => api.get<MyHubWheelbaseBooking[]>('/ioc/hub/wheelbase-bookings') });

export const useMyHubInsurance = () => useQuery({ queryKey: ['my-hub-insurance'], queryFn: () => api.get<MyHubInsurance>('/ioc/hub/insurance') });

/** The licence holder's own money: their monthly statements, split into owed and paid. */
export function holderTotals(payouts: HubPayout[] = []) {
  return {
    owed: payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amountCents, 0),
    paid: payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0),
    trips: payouts.reduce((s, p) => s + p.trips, 0),
  };
}
