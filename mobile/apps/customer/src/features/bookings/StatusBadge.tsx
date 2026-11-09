import { Badge, type BadgeTone } from '@crosscubes/ui';
import { STATUS_TONE, statusLabel } from '@crosscubes/core/web/features/bookings/status';
import type { BookingStatus } from '@crosscubes/core/web/features/bookings/types';

const TONE: Record<string, BadgeTone> = { default: 'primary', success: 'success', warning: 'warning', destructive: 'destructive', muted: 'neutral' };

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge label={statusLabel(status)} tone={TONE[STATUS_TONE[status] ?? 'muted']} />;
}
