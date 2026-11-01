import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';

export interface PublicHub {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
}

export const hubsApi = {
  live: () => api.get<PublicHub[]>('/hubs', undefined, false),
};

/** Cities taking bookings and applications right now. */
export function useLiveHubs() {
  return useQuery({ queryKey: ['live-hubs'], queryFn: hubsApi.live, staleTime: 5 * 60_000 });
}
