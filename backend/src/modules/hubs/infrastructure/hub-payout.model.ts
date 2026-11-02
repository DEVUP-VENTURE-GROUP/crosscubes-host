import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export const HUB_PAYOUT_METHODS = ['bank_transfer', 'zelle', 'check', 'other'] as const;
export type HubPayoutMethod = (typeof HUB_PAYOUT_METHODS)[number];

/** One month of a licence holder's share for one hub. */
export interface HubPayoutDoc {
  _id: string;
  hubId: string;
  /** YYYY-MM the trips ended in. */
  period: string;
  trips: number;
  /** Trip subtotals, before tax and protection. */
  grossCents: number;
  holderShareBps: number;
  amountCents: number;
  status: 'pending' | 'paid';
  paid?: { at: Date; by: string; method: HubPayoutMethod; reference?: string };
  createdAt: Date;
}

const schema = new Schema<HubPayoutDoc>(
  {
    _id: { type: String, default: () => uuid() },
    hubId: { type: String, required: true },
    period: { type: String, required: true },
    trips: { type: Number, required: true },
    grossCents: { type: Number, required: true },
    holderShareBps: { type: Number, required: true },
    amountCents: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    paid: { at: Date, by: String, method: { type: String, enum: HUB_PAYOUT_METHODS }, reference: String },
  },
  { timestamps: true },
);

// One statement per hub per month, however many times the job runs.
schema.index({ hubId: 1, period: 1 }, { unique: true });
schema.index({ status: 1, period: -1 });

export const HubPayoutModel = model<HubPayoutDoc>('HubPayout', schema);
