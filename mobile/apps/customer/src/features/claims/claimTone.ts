import type { BadgeTone } from '@crosscubes/ui';
import type { ClaimTone } from '@crosscubes/core/web/features/claims/status';

const MAP: Record<ClaimTone, BadgeTone> = { success: 'success', warning: 'warning', destructive: 'destructive', muted: 'neutral', default: 'primary' };

/** The website's claim badge tones in the app's badge palette. */
export const claimBadge = (tone: ClaimTone | undefined): BadgeTone => MAP[tone ?? 'muted'];
